import { encodeFunctionData, type Address, formatUnits } from "viem";
import { publicClient, agentAddress, sendTransaction } from "../agent/wallet.js";
import { config } from "../config.js";

// Aave V3 Pool ABI (supply + withdraw only)
const aavePoolAbi = [
  {
    name: "supply",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Approve USDC spending for Aave pool if needed */
async function ensureApproval(amount: bigint): Promise<void> {
  const allowance = (await publicClient.readContract({
    address: config.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [agentAddress, config.aavePool],
  })) as bigint;

  if (allowance < amount) {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [config.aavePool, amount],
    });
    await sendTransaction({ to: config.usdc, data });
    console.log(`[aave] Approved ${formatUnits(amount, 6)} USDC for Aave`);
  }
}

/** Supply USDC to Aave V3 to earn yield */
export async function supplyUsdc(amount: bigint): Promise<string> {
  await ensureApproval(amount);

  const data = encodeFunctionData({
    abi: aavePoolAbi,
    functionName: "supply",
    args: [config.usdc, amount, agentAddress, 0],
  });

  const hash = await sendTransaction({ to: config.aavePool, data });
  console.log(`[aave] Supplied ${formatUnits(amount, 6)} USDC → Aave V3`);
  return hash;
}

/** Withdraw USDC from Aave V3 */
export async function withdrawUsdc(amount: bigint): Promise<string> {
  const data = encodeFunctionData({
    abi: aavePoolAbi,
    functionName: "withdraw",
    args: [config.usdc, amount, agentAddress],
  });

  const hash = await sendTransaction({ to: config.aavePool, data });
  console.log(`[aave] Withdrew ${formatUnits(amount, 6)} USDC from Aave V3`);
  return hash;
}

/** Withdraw all USDC from Aave (use max uint256) */
export async function withdrawAllUsdc(): Promise<string> {
  const maxUint = 2n ** 256n - 1n;
  return withdrawUsdc(maxUint);
}

/** Get current Aave position value (aUSDC balance) */
export async function getAavePosition(): Promise<bigint> {
  return publicClient.readContract({
    address: config.aBasUSDC,
    abi: [
      {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [agentAddress],
  }) as Promise<bigint>;
}
