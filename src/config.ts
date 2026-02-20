import { type Address } from "viem";
import { base } from "viem/chains";
import "dotenv/config";

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

export const config = {
  chain: base,
  rpcUrl: env("BASE_RPC_URL", "https://mainnet.base.org"),
  privateKey: env("PRIVATE_KEY") as `0x${string}`,
  builderCode: env("BUILDER_CODE", "proofwell"),

  // Contracts
  proofwellContract: env("PROOFWELL_CONTRACT", "0x0000000000000000000000000000000000000000") as Address,
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  weth: "0x4200000000000000000000000000000000000006" as Address,
  aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address,
  aBasUSDC: "0x4e65fE4DBa92790696d040ac24Aa414708F5c0Ab" as Address,

  // Thresholds (USDC has 6 decimals)
  idleUsdcThreshold: BigInt(env("IDLE_USDC_THRESHOLD", "10000000")), // 10 USDC
  treasuryWithdrawThreshold: BigInt(env("TREASURY_WITHDRAW_THRESHOLD", "5000000")), // 5 USDC
  lowEthThreshold: BigInt("1000000000000000"), // 0.001 ETH

  // Agent
  loopIntervalMs: parseInt(env("LOOP_INTERVAL_MS", "300000")), // 5 min
  llmCallIntervalMs: 3600000, // 1 hour

  // API
  port: parseInt(env("PORT", "3001")),
  openaiApiKey: env("OPENAI_API_KEY", ""),

  // x402 attestation pricing (0.01 USDC = 10000 in 6 decimals)
  attestationPriceUsdc: BigInt("10000"),
} as const;
