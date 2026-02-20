import { type Address } from "viem";
import { base, baseSepolia } from "viem/chains";
import "dotenv/config";

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

type Network = "base-mainnet" | "base-sepolia";

const network = env("NETWORK", "base-mainnet") as Network;

const addresses = {
  "base-mainnet": {
    proofwell: env("PROOFWELL_CONTRACT", "0x0000000000000000000000000000000000000000") as Address,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    aaveUsdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address, // same on mainnet
    weth: "0x4200000000000000000000000000000000000006" as Address,
    aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address,
    aBasUSDC: "0x4e65fE4DBa92790696d040ac24Aa414708F5c0Ab" as Address,
  },
  "base-sepolia": {
    proofwell: env("PROOFWELL_CONTRACT", "0xF45DBE98b014cc8564291B052e8D98Bbe9C7651d") as Address,
    usdc: "0x22b90da5d436a4Aaf5464A540c62DB4aA59854eE" as Address, // MockUSDC
    aaveUsdc: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f" as Address, // Aave test USDC
    weth: "0x4200000000000000000000000000000000000006" as Address,
    aavePool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27" as Address,
    aBasUSDC: "0x10F1A9D11CDf50041f3f8cB7191CBe2f31750ACC" as Address,
  },
} as const;

const chains = {
  "base-mainnet": base,
  "base-sepolia": baseSepolia,
} as const;

const rpcDefaults = {
  "base-mainnet": "https://mainnet.base.org",
  "base-sepolia": "https://sepolia.base.org",
} as const;

const explorerUrls = {
  "base-mainnet": "https://basescan.org",
  "base-sepolia": "https://sepolia.basescan.org",
} as const;

const addrs = addresses[network];

export const config = {
  network,
  chain: chains[network],
  rpcUrl: env("BASE_RPC_URL", rpcDefaults[network]),
  privateKey: env("PRIVATE_KEY") as `0x${string}`,
  builderCode: env("BUILDER_CODE", "proofwell"),
  explorerUrl: explorerUrls[network],

  // Contracts
  proofwellContract: addrs.proofwell,
  usdc: addrs.usdc,
  aaveUsdc: addrs.aaveUsdc, // Aave's USDC (differs from proofwell USDC on testnet)
  weth: addrs.weth,
  aavePool: addrs.aavePool,
  aBasUSDC: addrs.aBasUSDC,

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
