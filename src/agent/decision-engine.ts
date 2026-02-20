import { formatUnits, formatEther, type Address } from "viem";
import { config } from "../config.js";
import { getBalances, agentAddress, publicClient } from "./wallet.js";
import { supplyUsdc, withdrawUsdc, getAavePosition } from "../actions/aave.js";
import {
  findActiveStakers,
  getStake,
  isResolvable,
  resolveExpired,
  formatStake,
  getCurrentWeek,
  getCohortInfo,
} from "../actions/proofwell.js";
import { logAction, logRevenue, logCost, getState, setState } from "./state.js";
import OpenAI from "openai";

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
  } catch {
    // Contract may not be deployed yet
  }

  return { balances, aavePosition, currentWeek, cohort };
}

/** Deterministic rules — no LLM needed */
async function deterministicDecisions(): Promise<Decision[]> {
  const decisions: Decision[] = [];
  const state = await gatherState();
  const { balances } = state;

  // Rule 1: Idle USDC above threshold → deposit to Aave
  if (balances.usdc > config.idleUsdcThreshold) {
    const depositAmount = balances.usdc - config.idleUsdcThreshold / 2n; // Keep some liquid
    decisions.push({
      action: "aave_supply",
      reason: `Idle USDC (${balances.usdcFormatted}) > threshold → depositing ${formatUnits(depositAmount, 6)} to Aave`,
      execute: async () => {
        const hash = await supplyUsdc(depositAmount);
        logAction("aave_supply", `Deposited ${formatUnits(depositAmount, 6)} USDC to Aave`, hash, Number(formatUnits(depositAmount, 6)));
      },
    });
  }

  // Rule 2: Find and resolve expired stakes
  if (config.proofwellContract !== "0x0000000000000000000000000000000000000000") {
    try {
      const stakers = await findActiveStakers();
      for (const user of stakers) {
        const stake = await getStake(user);
        if (isResolvable(stake)) {
          decisions.push({
            action: "resolve_expired",
            reason: `Stake ${formatStake(stake)} is expired + past buffer → resolving for treasury`,
            execute: async () => {
              const hash = await resolveExpired(user);
              logAction("resolve_expired", `Resolved expired stake for ${user}`, hash);
              logRevenue("treasury_slash", 0, hash, `Resolved ${user}`);
            },
          });
        }
      }
    } catch (e: any) {
      console.log(`[decisions] Skipping proofwell scan: ${e.message}`);
    }
  }

  // Rule 3: Low ETH for gas → log warning (swap would need a DEX integration)
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
  const totalUsdc = balances.usdc + aavePosition;
  const aavePercent = totalUsdc > 0n ? Number((aavePosition * 100n) / totalUsdc) : 0;

  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  const prompt = `You are a DeFi treasury agent for Proofwell on Base mainnet.

Current state:
- Wallet ETH: ${balances.ethFormatted}
- Wallet USDC: ${balances.usdcFormatted}
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

    // Log LLM cost (~$0.0001 per call for gpt-4o-mini)
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

    const amountRaw = BigInt(Math.floor(decision.amount_usdc * 1_000_000));

    if (decision.action === "deposit" && amountRaw > 0n && amountRaw <= balances.usdc) {
      return {
        action: "llm_deposit",
        reason: `LLM: ${decision.reason}`,
        execute: async () => {
          const hash = await supplyUsdc(amountRaw);
          logAction("llm_deposit", decision.reason, hash, decision.amount_usdc);
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
        },
      };
    }
  } catch (e: any) {
    console.log(`[llm] Error: ${e.message}`);
  }

  return null;
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
      logAction(d.action, `FAILED: ${e.message}`, undefined, 0, 0, false);
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
      logAction(llm.action, `FAILED: ${e.message}`, undefined, 0, 0, false);
    }
  }

  if (executed.length === 0) {
    console.log("[decide] No actions needed this cycle");
  }

  return executed;
}
