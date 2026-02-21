import { config } from "../config.js";
import { agentAddress, getBalances } from "./wallet.js";
import { runDecisionCycle } from "./decision-engine.js";
import { logAction, logCost, getState, setState } from "./state.js";
import { startApiServer } from "../api/server.js";

// Railway $5/mo ≈ $0.007/hr, 12 cycles/hr
const COMPUTE_COST_PER_CYCLE = 0.0006;

async function printStatus() {
  const balances = await getBalances();
  console.log(`\n========== Proofwell Agent ==========`);
  console.log(`Network:  ${config.network}`);
  console.log(`Address:  ${agentAddress}`);
  console.log(`ETH:      ${balances.ethFormatted}`);
  console.log(`USDC:     ${balances.usdcFormatted}`);
  console.log(`aUSDC:    ${balances.aUsdcFormatted}`);
  console.log(`Contract: ${config.proofwellContract}`);
  console.log(`Explorer: ${config.explorerUrl}`);
  console.log(`Loop:     every ${config.loopIntervalMs / 1000}s`);
  console.log(`=====================================\n`);
}

async function loop() {
  const cycleNum = parseInt(getState("cycle_count") ?? "0") + 1;
  setState("cycle_count", String(cycleNum));

  console.log(`\n--- Cycle #${cycleNum} @ ${new Date().toISOString()} ---`);

  try {
    const actions = await runDecisionCycle();
    setState("last_cycle", new Date().toISOString());
    setState("last_cycle_actions", String(actions.length));

    // Log compute cost every cycle
    logCost("compute", COMPUTE_COST_PER_CYCLE, `Cycle #${cycleNum} compute (Railway)`);
  } catch (e: any) {
    console.error(`[loop] Cycle failed: ${e.message}`);
    logAction("cycle_error", e.message, undefined, 0, 0, false);
  }
}

async function main() {
  console.log("Starting Proofwell Agent...");

  await printStatus();

  logAction("startup", `Agent started at ${agentAddress} on ${config.network}`);

  // Start API server
  startApiServer();

  // Run first cycle immediately
  await loop();

  // Then every N ms
  setInterval(() => { loop().catch(e => console.error("[loop] Unhandled:", e)); }, config.loopIntervalMs);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
