import { formatUnits, formatEther, type Address } from "viem";
import { config } from "../config.js";
import { getBalances, agentAddress, publicClient } from "./wallet.js";
import { supplyUsdc, withdrawUsdc, getAavePosition } from "../actions/aave.js";
import {
  findActiveStakers,
  getActiveStakes,
  isResolvable,
  resolveExpired,
  formatStake,
  getCurrentWeek,
  getCohortInfo,
} from "../actions/proofwell.js";
import { logAction, logRevenue, logCost, getState, setState } from "./state.js";
import OpenAI from "openai";

// Estimated gas cost per tx in USD (Base L2, ~$0.001-0.01)
const GAS_COST_ESTIMATE_USD = 0.005;

interface Decision {
  action: string;
  reason: string;
  execute: () => Promise<void>;
}

/** Gather all chain state the agent needs */
async function gatherState() {
  const balances = await getBalances();
  const aavePosition = await getAavePosition();

  let currentWeek: bigint | null = null;
  let cohort = null;
  try {
    currentWeek = await getCurrentWeek();
    cohort = await getCohortInfo(currentWeek);
  } catch (e: any) {
    console.log('[state] Contract read failed:', e.message);
  }

  return { balances, aavePosition, currentWeek, cohort };
}

/** Deterministic rules — no LLM needed */
async function deterministicDecisions(): Promise<Decision[]> {
  const decisions: Decision[] = [];
  const state = await gatherState();
  const { balances } = state;

  // Rule 0: Track Aave yield as revenue (only interest, not deposits)
  // Deposits update last_aave_position immediately after executing, so the
  // delta here only captures real yield accrued between cycles.
  const aavePosition = state.aavePosition;
  const lastAavePosition = getState("last_aave_position");
  if (lastAavePosition) {
    const prev = BigInt(lastAavePosition);
    if (aavePosition > prev) {
      const yieldDelta = aavePosition - prev;
      const yieldUsdc = Number(formatUnits(yieldDelta, 6));
      // Cap at $1 to catch any deposit-as-yield bugs — real yield is tiny
      if (yieldUsdc > 0.000001 && yieldUsdc < 1.0) {
        logRevenue("aave_yield", yieldUsdc, undefined, `Aave V3 interest: ${formatUnits(yieldDelta, 6)} USDC`);
        logAction("aave_yield", `Earned ${formatUnits(yieldDelta, 6)} USDC yield from Aave V3`, undefined, yieldUsdc);
      }
    }
  }
  setState("last_aave_position", aavePosition.toString());

  // Rule 1: Idle Aave USDC above threshold → deposit to Aave
  // On testnet, Aave uses a different USDC than Proofwell. Use aaveUsdc balance.
  const aaveUsdcBalance = balances.aaveUsdc;
  if (aaveUsdcBalance > config.idleUsdcThreshold) {
    const depositAmount = aaveUsdcBalance - config.idleUsdcThreshold / 2n; // Keep some liquid
    decisions.push({
      action: "aave_supply",
      reason: `Idle USDC (${formatUnits(aaveUsdcBalance, 6)}) > threshold → depositing ${formatUnits(depositAmount, 6)} to Aave`,
      execute: async () => {
        const hash = await supplyUsdc(depositAmount);
        logAction("aave_supply", `Deposited ${formatUnits(depositAmount, 6)} USDC to Aave`, hash, Number(formatUnits(depositAmount, 6)));
        logCost("gas", GAS_COST_ESTIMATE_USD, "Aave supply tx gas");
        // Update position tracker so deposit isn't counted as yield next cycle
        const newPosition = await getAavePosition();
        setState("last_aave_position", newPosition.toString());
      },
    });
  }

  // Rule 2: Find and resolve expired V3 stakes
  if (config.proofwellContract !== "0x0000000000000000000000000000000000000000") {
    let stakers: Address[] = [];
    try {
      stakers = await findActiveStakers();
    } catch (e: any) {
      console.log(`[decisions] Skipping proofwell scan: ${e.message}`);
    }
    for (const user of stakers) {
      try {
        const stakes = await getActiveStakes(user);
        for (const stake of stakes) {
          if (isResolvable(stake)) {
            // Calculate forfeiture: if user didn't complete all days, 40% goes to treasury
            const failedDays = Number(stake.durationDays - stake.successfulDays);
            const forfeitRate = failedDays > 0 ? 0.4 : 0;
            // Only track revenue for USDC stakes (ETH has no oracle, can't convert to USD)
            const treasuryRevenue = stake.isUSDC
              ? Number(formatUnits(stake.amount, 6)) * forfeitRate
              : 0;

            decisions.push({
              action: "resolve_expired",
              reason: `Stake ${formatStake(stake)} is expired + past buffer → resolving (${failedDays} failed days, ~$${treasuryRevenue.toFixed(4)} to treasury)`,
              execute: async () => {
                const hash = await resolveExpired(user, stake.stakeId);
                logAction("resolve_expired", `Resolved expired stake for ${user}[${stake.stakeId}] — ${failedDays} failed days`, hash, treasuryRevenue);
                if (treasuryRevenue > 0) {
                  logRevenue("treasury_slash", treasuryRevenue, hash, `40% forfeiture from ${user.slice(0, 10)}[${stake.stakeId}]`);
                }
                logCost("gas", GAS_COST_ESTIMATE_USD, "resolveExpiredV3 tx gas");
              },
            });
          }
        }
      } catch (e: any) {
        console.log(`[decisions] Skipping stakes for ${user.slice(0, 10)}: ${e.message}`);
      }
    }
  }

  // Rule 3: Low ETH for gas → log warning
  if (balances.eth < config.lowEthThreshold) {
    decisions.push({
      action: "low_eth_warning",
      reason: `ETH balance (${balances.ethFormatted}) below threshold — need gas`,
      execute: async () => {
        logAction("warning", `Low ETH: ${balances.ethFormatted}. Agent needs gas top-up.`);
      },
    });
  }

  return decisions;
}

/** LLM-powered decision for ambiguous situations (called ~1x/hour) */
async function llmDecision(): Promise<Decision | null> {
  if (!config.openaiApiKey) return null;

  const lastLlmCall = getState("last_llm_call");
  const now = Date.now();
  if (lastLlmCall && now - parseInt(lastLlmCall) < config.llmCallIntervalMs) {
    return null; // Too soon
  }

  const state = await gatherState();
  const { balances, aavePosition } = state;
  const aaveUsdcBalance = balances.aaveUsdc;
  const totalUsdc = aaveUsdcBalance + aavePosition;
  const aavePercent = totalUsdc > 0n ? Number((aavePosition * 100n) / totalUsdc) : 0;

  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  const prompt = `You are a DeFi treasury agent for Proofwell on Base (${config.network}).

Current state:
- Wallet ETH: ${balances.ethFormatted}
- Wallet USDC (Proofwell): ${balances.usdcFormatted}
- Wallet USDC (Aave): ${formatUnits(aaveUsdcBalance, 6)}
- Aave aUSDC: ${formatUnits(aavePosition, 6)}
- Total USDC value: ${formatUnits(totalUsdc, 6)}
- % in Aave: ${aavePercent}%

Rules:
- Keep 20-30% liquid for gas and operations
- Deposit excess to Aave for yield
- If Aave position is >80% of total, consider withdrawing some to stay liquid
- If total value is very small (<$5), don't bother rebalancing

Should you rebalance? Reply with JSON:
{"action": "none" | "deposit" | "withdraw", "amount_usdc": number, "reason": "brief explanation"}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 200,
    });

    logCost("llm", 0.0001, "gpt-4o-mini rebalance decision");
    setState("last_llm_call", String(now));

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const decision = JSON.parse(content) as {
      action: string;
      amount_usdc: number;
      reason: string;
    };

    if (decision.action === "none") return null;

    if (typeof decision.amount_usdc !== "number" || !isFinite(decision.amount_usdc) || decision.amount_usdc <= 0) {
      console.log(`[llm] Invalid amount_usdc: ${decision.amount_usdc}`);
      return null;
    }

    const amountRaw = BigInt(Math.floor(decision.amount_usdc * 1_000_000));

    if (decision.action === "deposit" && amountRaw > 0n && amountRaw <= aaveUsdcBalance) {
      return {
        action: "llm_deposit",
        reason: `LLM: ${decision.reason}`,
        execute: async () => {
          const hash = await supplyUsdc(amountRaw);
          logAction("llm_deposit", decision.reason, hash, decision.amount_usdc);
          const newPos = await getAavePosition();
          setState("last_aave_position", newPos.toString());
        },
      };
    }

    if (decision.action === "withdraw" && amountRaw > 0n && amountRaw <= aavePosition) {
      return {
        action: "llm_withdraw",
        reason: `LLM: ${decision.reason}`,
        execute: async () => {
          const hash = await withdrawUsdc(amountRaw);
          logAction("llm_withdraw", decision.reason, hash, decision.amount_usdc);
          const newPos = await getAavePosition();
          setState("last_aave_position", newPos.toString());
        },
      };
    }
  } catch (e: any) {
    console.log(`[llm] Error: ${e.message}`);
  }

  return null;
}

/** Extract a clean error summary from viem or other errors */
function sanitizeError(e: any): string {
  // viem provides a short summary
  if (e.shortMessage) return e.shortMessage.slice(0, 120);
  const msg: string = e.message ?? String(e);
  // Extract the "Details:" line from viem verbose errors
  const details = msg.match(/Details:\s*(.+)/);
  if (details) return details[1].slice(0, 120);
  return msg.slice(0, 120);
}

/** Run one decision cycle */
export async function runDecisionCycle(): Promise<string[]> {
  const executed: string[] = [];

  // 1. Deterministic rules
  const rules = await deterministicDecisions();
  for (const d of rules) {
    console.log(`[decide] ${d.action}: ${d.reason}`);
    try {
      await d.execute();
      executed.push(`${d.action}: ${d.reason}`);
    } catch (e: any) {
      console.error(`[decide] Failed ${d.action}: ${e.message}`);
      logAction(d.action, `FAILED: ${sanitizeError(e)}`, undefined, 0, 0, false);
    }
  }

  // 2. LLM fallback (rate-limited)
  const llm = await llmDecision();
  if (llm) {
    console.log(`[decide] ${llm.action}: ${llm.reason}`);
    try {
      await llm.execute();
      executed.push(`${llm.action}: ${llm.reason}`);
    } catch (e: any) {
      console.error(`[decide] Failed ${llm.action}: ${e.message}`);
      logAction(llm.action, `FAILED: ${sanitizeError(e)}`, undefined, 0, 0, false);
    }
  }

  if (executed.length === 0) {
    console.log("[decide] No actions needed this cycle");
  }

  return executed;
}
