import { encodeFunctionData, type Address, formatUnits, type Hash } from "viem";
import { publicClient, agentAddress, walletClient, account, chain, sendTransaction } from "../agent/wallet.js";
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

/** Approve Aave USDC spending for Aave pool if needed.
 * Uses walletClient directly (no builder code) — approve is a prerequisite, not an agent action. */
async function ensureApproval(amount: bigint): Promise<void> {
  const allowance = (await publicClient.readContract({
    address: config.aaveUsdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [agentAddress, config.aavePool],
  })) as bigint;

  if (allowance < amount) {
    // Approve max to avoid repeated approvals
    const approveAmount = 2n ** 128n - 1n;
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [config.aavePool, approveAmount],
    });
    const hash = await walletClient.sendTransaction({
      account,
      chain,
      to: config.aaveUsdc,
      data,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[aave] Approved USDC for Aave pool`);
  }
}

/** Supply USDC to Aave V3 to earn yield (uses Aave's USDC, not Proofwell's MockUSDC) */
export async function supplyUsdc(amount: bigint): Promise<string> {
  await ensureApproval(amount);

  const data = encodeFunctionData({
    abi: aavePoolAbi,
    functionName: "supply",
    args: [config.aaveUsdc, amount, agentAddress, 0],
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
    args: [config.aaveUsdc, amount, agentAddress],
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
