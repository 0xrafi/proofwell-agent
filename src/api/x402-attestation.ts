import { type Request, type Response } from "express";
import { type Address, isAddress } from "viem";
import { getActiveStakes, SECONDS_PER_DAY, type StakeInfo } from "../actions/proofwell.js";
import { logRevenue } from "../agent/state.js";
import { config } from "../config.js";

/**
 * x402 Attestation Endpoint
 *
 * Returns behavioral attestation data for a wallet:
 * - Is this wallet staking on Proofwell?
 * - What's their success rate across all V3 stakes?
 * - Discipline score (0-100)
 *
 * In production, this is gated by @x402/express middleware
 * charging 0.01 USDC per query. For hackathon demo,
 * we include the x402 payment headers but allow free access
 * with a query param for testing.
 */
export async function attestationHandler(req: Request, res: Response) {
  const wallet = req.params.wallet as Address;

  if (!isAddress(wallet)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }

  try {
    const stakes = await getActiveStakes(wallet);
    const attestation = buildAttestation(wallet, stakes);

    // Check for x402 payment receipt in header
    const paymentReceipt = req.headers["x-payment-receipt"];
    if (paymentReceipt) {
      logRevenue("x402_attestation", 0.01, undefined, `Attestation query for ${wallet}`);
    }

    // Set x402 payment headers for clients that support it
    res.setHeader("X-Payment-Required", "true");
    res.setHeader("X-Payment-Amount", "10000"); // 0.01 USDC in 6 decimals
    res.setHeader("X-Payment-Currency", config.usdc);
    res.setHeader("X-Payment-Recipient", config.proofwellContract);

    res.json(attestation);
  } catch (e: any) {
    // If contract not deployed or no stake, return empty attestation
    res.json(buildEmptyAttestation(wallet));
  }
}

interface Attestation {
  wallet: Address;
  isStaking: boolean;
  totalStakes: number;
  stakeAmount: string;
  stakeAsset: string;
  daysCompleted: number;
  totalDays: number;
  successRate: number;
  disciplineScore: number;
  isActive: boolean;
  timestamp: string;
  source: string;
}

function buildAttestation(wallet: Address, stakes: StakeInfo[]): Attestation {
  if (stakes.length === 0) return buildEmptyAttestation(wallet);

  // Aggregate across all active stakes
  let totalSuccessful = 0;
  let totalDuration = 0;
  let totalAmountUsdc = 0n;
  let totalAmountEth = 0n;
  let hasActive = false;

  const now = BigInt(Math.floor(Date.now() / 1000));

  for (const s of stakes) {
    totalSuccessful += Number(s.successfulDays);
    totalDuration += Number(s.durationDays);
    if (s.isUSDC) totalAmountUsdc += s.amount;
    else totalAmountEth += s.amount;

    const stakeEnd = s.startTimestamp + s.durationDays * BigInt(SECONDS_PER_DAY);
    if (!s.claimed && now < stakeEnd) hasActive = true;
  }

  const successRate = totalDuration > 0 ? totalSuccessful / totalDuration : 0;
  const durationWeight = Math.min(totalDuration / 30, 1);
  const disciplineScore = Math.round(successRate * 100 * (0.5 + 0.5 * durationWeight));

  const amountStr = totalAmountUsdc > 0n
    ? `${Number(totalAmountUsdc) / 1_000_000} USDC`
    : `${Number(totalAmountEth) / 1e18} ETH`;

  return {
    wallet,
    isStaking: true,
    totalStakes: stakes.length,
    stakeAmount: amountStr,
    stakeAsset: totalAmountUsdc > 0n ? "USDC" : "ETH",
    daysCompleted: totalSuccessful,
    totalDays: totalDuration,
    successRate: Math.round(successRate * 100) / 100,
    disciplineScore,
    isActive: hasActive,
    timestamp: new Date().toISOString(),
    source: "proofwell-agent",
  };
}

function buildEmptyAttestation(wallet: Address): Attestation {
  return {
    wallet,
    isStaking: false,
    totalStakes: 0,
    stakeAmount: "0",
    stakeAsset: "none",
    daysCompleted: 0,
    totalDays: 0,
    successRate: 0,
    disciplineScore: 0,
    isActive: false,
    timestamp: new Date().toISOString(),
    source: "proofwell-agent",
  };
}
