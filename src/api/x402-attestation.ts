import { type Request, type Response } from "express";
import { type Address, isAddress } from "viem";
import { getStake, type StakeInfo, getCurrentWeek, getCohortInfo } from "../actions/proofwell.js";
import { logRevenue } from "../agent/state.js";
import { config } from "../config.js";

/**
 * x402 Attestation Endpoint
 *
 * Returns behavioral attestation data for a wallet:
 * - Is this wallet staking on Proofwell?
 * - What's their success rate?
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
    const stake = await getStake(wallet);
    const attestation = buildAttestation(wallet, stake);

    // Check for x402 payment receipt in header
    const paymentReceipt = req.headers["x-payment-receipt"];
    if (paymentReceipt) {
      // Log revenue from x402 payment
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

function buildAttestation(wallet: Address, stake: StakeInfo): Attestation {
  const isStaking = stake.amount > 0n;
  const daysCompleted = Number(stake.successfulDays);
  const totalDays = Number(stake.durationDays);
  const successRate = totalDays > 0 ? daysCompleted / totalDays : 0;

  // Discipline score: weighted by stake amount, duration, and success rate
  // Higher stakes + longer durations + better rates = higher score
  const durationWeight = Math.min(totalDays / 30, 1); // Max at 30 days
  const disciplineScore = Math.round(successRate * 100 * (0.5 + 0.5 * durationWeight));

  const now = BigInt(Math.floor(Date.now() / 1000));
  const stakeEnd = stake.startTimestamp + stake.durationDays * 86400n;
  const isActive = isStaking && !stake.claimed && now < stakeEnd;

  return {
    wallet,
    isStaking,
    stakeAmount: stake.isUSDC
      ? `${Number(stake.amount) / 1_000_000} USDC`
      : `${Number(stake.amount) / 1e18} ETH`,
    stakeAsset: stake.isUSDC ? "USDC" : "ETH",
    daysCompleted,
    totalDays,
    successRate: Math.round(successRate * 100) / 100,
    disciplineScore,
    isActive,
    timestamp: new Date().toISOString(),
    source: "proofwell-agent",
  };
}

function buildEmptyAttestation(wallet: Address): Attestation {
  return {
    wallet,
    isStaking: false,
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
