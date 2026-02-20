import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Chain,
  type Hash,
  type WalletClient,
  type PublicClient,
  formatEther,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config.js";
import { appendBuilderCode } from "../actions/builder-codes.js";

const account = privateKeyToAccount(config.privateKey);
const chain = config.chain as Chain;

export const publicClient: PublicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

export const walletClient: WalletClient = createWalletClient({
  account,
  chain,
  transport: http(config.rpcUrl),
});

export const agentAddress: Address = account.address;

/** Send transaction with ERC-8021 builder code suffix appended to calldata */
export async function sendTransaction(tx: {
  to: Address;
  data?: `0x${string}`;
  value?: bigint;
}): Promise<Hash> {
  const data = tx.data
    ? appendBuilderCode(tx.data, config.builderCode)
    : appendBuilderCode("0x", config.builderCode);

  const hash = await walletClient.sendTransaction({
    account,
    chain,
    to: tx.to,
    data,
    value: tx.value ?? 0n,
  });

  console.log(`[tx] ${hash}`);
  return hash;
}

const balanceOfAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export async function getBalances() {
  // Always read Proofwell USDC + Aave USDC balances
  // On mainnet these are the same token; on testnet they differ
  const reads: Promise<bigint>[] = [
    publicClient.getBalance({ address: agentAddress }),
    publicClient.readContract({
      address: config.usdc,
      abi: balanceOfAbi,
      functionName: "balanceOf",
      args: [agentAddress],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: config.aBasUSDC,
      abi: balanceOfAbi,
      functionName: "balanceOf",
      args: [agentAddress],
    }) as Promise<bigint>,
  ];

  // If Aave USDC differs from Proofwell USDC, also read it
  const hasSeparateAaveUsdc = config.aaveUsdc !== config.usdc;
  if (hasSeparateAaveUsdc) {
    reads.push(
      publicClient.readContract({
        address: config.aaveUsdc,
        abi: balanceOfAbi,
        functionName: "balanceOf",
        args: [agentAddress],
      }) as Promise<bigint>,
    );
  }

  const results = await Promise.all(reads);
  const [ethBalance, usdcBalance, aUsdcBalance] = results;
  const aaveUsdcBalance = hasSeparateAaveUsdc ? results[3] : usdcBalance;

  return {
    eth: ethBalance,
    ethFormatted: formatEther(ethBalance),
    usdc: usdcBalance,
    usdcFormatted: formatUnits(usdcBalance, 6),
    aUsdc: aUsdcBalance,
    aUsdcFormatted: formatUnits(aUsdcBalance, 6),
    aaveUsdc: aaveUsdcBalance,
    aaveUsdcFormatted: formatUnits(aaveUsdcBalance, 6),
  };
}
