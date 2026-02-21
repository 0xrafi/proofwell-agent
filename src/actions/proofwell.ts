import { encodeFunctionData, type Address, formatUnits, formatEther, getAddress } from "viem";
import { publicClient, agentAddress, sendTransaction } from "../agent/wallet.js";
import { config } from "../config.js";

// ProofwellStakingV3 ABI (relevant functions only)
const proofwellAbi = [
  // V3 multi-stake read functions
  {
    name: "stakesV3",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "stakeId", type: "uint256" },
    ],
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
    name: "getStakeV3",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "stakeId", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
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
    ],
  },
  {
    name: "nextStakeId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "activeStakeCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "resolveExpiredV3",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "stakeId", type: "uint256" },
    ],
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

// V3 events for scanning
const stakeEvents = [
  {
    name: "StakedETHV3",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "stakeId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "goalSeconds", type: "uint256", indexed: false },
      { name: "durationDays", type: "uint256", indexed: false },
      { name: "startTimestamp", type: "uint256", indexed: false },
      { name: "cohortWeek", type: "uint256", indexed: false },
    ],
  },
  {
    name: "StakedUSDCV3",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "stakeId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "goalSeconds", type: "uint256", indexed: false },
      { name: "durationDays", type: "uint256", indexed: false },
      { name: "startTimestamp", type: "uint256", indexed: false },
      { name: "cohortWeek", type: "uint256", indexed: false },
    ],
  },
] as const;

const SECONDS_PER_DAY = 300;       // matches contract demo constants
const RESOLUTION_BUFFER = 0;       // matches contract demo constants

const KNOWN_STAKERS: Address[] = [
  "0xc59e6289F42b8228DF2E8c88Bb33442e8B91B7d8",
  "0x9B0382a220Ba69FD4464d96B1d1925d982e05791",
  "0x997e69b16ddaD2BECF7e4CB98B5899d9a3Bb18E8",
  "0xdB2517c475E160254c8af290BCeCaCbdd614AbeA",
  "0x50168133548836cb6B9dA964feeCa49C9Fe412A6",
  "0x08DF2e88f7db895642cAdB03CF3A0195223b6f95",
  "0x0937Fe3867cB9363DB530754d0A34812656719Cc",
  "0xF36bD547Ac77646AE6ba98c216E61d8A4d3120C8",
  "0x3e2F5265a29Cf88cb3619283026A53555cDc29fa",
  "0xd1454493d747B6fE6bF49c2a64cEb68d8259145A",
  "0xAc4006412d33693Cb690ecDa5a4253583cdC40F1",
  "0x385DBB4a23af0bF6d26a35f9B273716B78a0D143",
  "0xAa067a1821b466488827f60F3Cfd6822144120c0",
  "0x4e45B7a1D403E2d09b757c3FB909BA2cBCD59cF5",
].map(a => getAddress(a));

export interface StakeInfo {
  user: Address;
  stakeId: bigint;
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

/** Read a specific stake by user + stakeId */
export async function getStake(user: Address, stakeId: bigint): Promise<StakeInfo> {
  const result = await publicClient.readContract({
    address: config.proofwellContract,
    abi: proofwellAbi,
    functionName: "stakesV3",
    args: [user, stakeId],
  });

  return {
    user,
    stakeId,
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

/** Get all active stakes for a user */
export async function getActiveStakes(user: Address): Promise<StakeInfo[]> {
  const nextId = await publicClient.readContract({
    address: config.proofwellContract,
    abi: proofwellAbi,
    functionName: "nextStakeId",
    args: [user],
  }) as bigint;

  const stakes: StakeInfo[] = [];
  for (let i = 0n; i < nextId; i++) {
    const stake = await getStake(user, i);
    if (stake.amount > 0n && !stake.claimed) {
      stakes.push(stake);
    }
  }
  return stakes;
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

/** Resolve an expired V3 stake */
export async function resolveExpired(user: Address, stakeId: bigint): Promise<string> {
  const data = encodeFunctionData({
    abi: proofwellAbi,
    functionName: "resolveExpiredV3",
    args: [user, stakeId],
  });

  return sendTransaction({
    to: config.proofwellContract,
    data,
  });
}

/** Scan for stakers by reading recent V3 Staked events */
export async function findActiveStakers(fromBlock?: bigint): Promise<Address[]> {
  const currentBlock = await publicClient.getBlockNumber();
  const from = fromBlock ?? currentBlock - 9900n; // ~8 hours on Base (2s blocks), within RPC log limits

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

  const users = new Set<Address>(KNOWN_STAKERS);
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
  return `${stake.user.slice(0, 8)}...[${stake.stakeId}] | ${amount} | ${stake.successfulDays}/${stake.durationDays} days | claimed=${stake.claimed}`;
}
