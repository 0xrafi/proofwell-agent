import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Hash,
  type TransactionRequest,
  formatEther,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config.js";
import { appendBuilderCode } from "../actions/builder-codes.js";

const account = privateKeyToAccount(config.privateKey);

export const publicClient = createPublicClient({
  chain: config.chain,
  transport: http(config.rpcUrl),
});

export const walletClient = createWalletClient({
  account,
  chain: config.chain,
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
    to: tx.to,
    data,
    value: tx.value ?? 0n,
  });

  console.log(`[tx] ${hash}`);
  return hash;
}

export async function getBalances() {
  const [ethBalance, usdcBalance, aUsdcBalance] = await Promise.all([
    publicClient.getBalance({ address: agentAddress }),
    publicClient.readContract({
      address: config.usdc,
      abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
      functionName: "balanceOf",
      args: [agentAddress],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: config.aBasUSDC,
      abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
      functionName: "balanceOf",
      args: [agentAddress],
    }) as Promise<bigint>,
  ]);

  return {
    eth: ethBalance,
    ethFormatted: formatEther(ethBalance),
    usdc: usdcBalance,
    usdcFormatted: formatUnits(usdcBalance, 6),
    aUsdc: aUsdcBalance,
    aUsdcFormatted: formatUnits(aUsdcBalance, 6),
  };
}
