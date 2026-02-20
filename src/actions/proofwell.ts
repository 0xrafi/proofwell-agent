import { encodeFunctionData, type Address, formatUnits, formatEther } from "viem";
import { publicClient, agentAddress, sendTransaction } from "../agent/wallet.js";
import { config } from "../config.js";

// ProofwellStakingV2 ABI (relevant functions only)
const proofwellAbi = [
  {
    name: "stakes",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "goalSeconds", type: "uint256" },
      { name: "startTimestamp", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "pubKeyX", type: "bytes32" },
      { name: "pubKeyY", type: "bytes32" },
      { name: "successfulDays", type: "uint256" },
      { name: "claimed", type: "bool" },
      { name: "isUSDC", type: "bool" },
      { name: "cohortWeek", type: "uint256" },
    ],
  },
  {
    name: "resolveExpired",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    name: "treasury",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getCurrentWeek",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getCohortInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "week", type: "uint256" }],
    outputs: [
      { name: "poolETH", type: "uint256" },
      { name: "poolUSDC", type: "uint256" },
      { name: "remainingWinnersETH", type: "uint256" },
      { name: "remainingWinnersUSDC", type: "uint256" },
      { name: "totalStakersETH", type: "uint256" },
      { name: "totalStakersUSDC", type: "uint256" },
    ],
  },
  {
    name: "version",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

// Events for scanning
const stakeEvents = [
  {
    name: "StakedETH",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "goalSeconds", type: "uint256", indexed: false },
      { name: "durationDays", type: "uint256", indexed: false },
      { name: "startTimestamp", type: "uint256", indexed: false },
      { name: "cohortWeek", type: "uint256", indexed: false },
    ],
  },
  {
    name: "StakedUSDC",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "goalSeconds", type: "uint256", indexed: false },
      { name: "durationDays", type: "uint256", indexed: false },
      { name: "startTimestamp", type: "uint256", indexed: false },
      { name: "cohortWeek", type: "uint256", indexed: false },
    ],
  },
] as const;

const SECONDS_PER_DAY = 86400;
const RESOLUTION_BUFFER = 7 * SECONDS_PER_DAY;

export interface StakeInfo {
  user: Address;
  amount: bigint;
  goalSeconds: bigint;
  startTimestamp: bigint;
  durationDays: bigint;
  successfulDays: bigint;
  claimed: boolean;
  isUSDC: boolean;
  cohortWeek: bigint;
}

export interface CohortInfo {
  poolETH: bigint;
  poolUSDC: bigint;
  remainingWinnersETH: bigint;
  remainingWinnersUSDC: bigint;
  totalStakersETH: bigint;
  totalStakersUSDC: bigint;
}

/** Read a user's stake */
export async function getStake(user: Address): Promise<StakeInfo> {
  const result = await publicClient.readContract({
    address: config.proofwellContract,
    abi: proofwellAbi,
    functionName: "stakes",
    args: [user],
  });

  return {
    user,
    amount: result[0],
    goalSeconds: result[1],
    startTimestamp: result[2],
    durationDays: result[3],
    successfulDays: result[6],
    claimed: result[7],
    isUSDC: result[8],
    cohortWeek: result[9],
  };
}

/** Get treasury address from contract */
export async function getTreasuryAddress(): Promise<Address> {
  return publicClient.readContract({
    address: config.proofwellContract,
    abi: proofwellAbi,
    functionName: "treasury",
  }) as Promise<Address>;
}

/** Get current cohort week */
export async function getCurrentWeek(): Promise<bigint> {
  return publicClient.readContract({
    address: config.proofwellContract,
    abi: proofwellAbi,
    functionName: "getCurrentWeek",
  }) as Promise<bigint>;
}

/** Get cohort info for a given week */
export async function getCohortInfo(week: bigint): Promise<CohortInfo> {
  const result = await publicClient.readContract({
    address: config.proofwellContract,
    abi: proofwellAbi,
    functionName: "getCohortInfo",
    args: [week],
  });

  return {
    poolETH: result[0],
    poolUSDC: result[1],
    remainingWinnersETH: result[2],
    remainingWinnersUSDC: result[3],
    totalStakersETH: result[4],
    totalStakersUSDC: result[5],
  };
}

/** Check if a stake is resolvable (expired + past resolution buffer) */
export function isResolvable(stake: StakeInfo): boolean {
  if (stake.claimed || stake.amount === 0n) return false;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const stakeEnd = stake.startTimestamp + stake.durationDays * BigInt(SECONDS_PER_DAY);
  return now > stakeEnd + BigInt(RESOLUTION_BUFFER);
}

/** Resolve an expired stake — earns leftover pool for treasury */
export async function resolveExpired(user: Address): Promise<string> {
  const data = encodeFunctionData({
    abi: proofwellAbi,
    functionName: "resolveExpired",
    args: [user],
  });

  return sendTransaction({
    to: config.proofwellContract,
    data,
  });
}

/** Scan for stakers by reading recent Staked events */
export async function findActiveStakers(fromBlock?: bigint): Promise<Address[]> {
  const currentBlock = await publicClient.getBlockNumber();
  const from = fromBlock ?? currentBlock - 100000n; // ~4 days of blocks

  const [ethEvents, usdcEvents] = await Promise.all([
    publicClient.getLogs({
      address: config.proofwellContract,
      event: stakeEvents[0],
      fromBlock: from,
      toBlock: currentBlock,
    }),
    publicClient.getLogs({
      address: config.proofwellContract,
      event: stakeEvents[1],
      fromBlock: from,
      toBlock: currentBlock,
    }),
  ]);

  const users = new Set<Address>();
  for (const e of [...ethEvents, ...usdcEvents]) {
    if (e.args.user) users.add(e.args.user);
  }
  return [...users];
}

/** Get contract version */
export async function getVersion(): Promise<string> {
  return publicClient.readContract({
    address: config.proofwellContract,
    abi: proofwellAbi,
    functionName: "version",
  }) as Promise<string>;
}

/** Format stake for display */
export function formatStake(stake: StakeInfo): string {
  const amount = stake.isUSDC
    ? `${formatUnits(stake.amount, 6)} USDC`
    : `${formatEther(stake.amount)} ETH`;
  return `${stake.user.slice(0, 8)}... | ${amount} | ${stake.successfulDays}/${stake.durationDays} days | claimed=${stake.claimed}`;
}
