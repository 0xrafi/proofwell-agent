import express from "express";
import cors from "cors";
import { config } from "../config.js";
import { agentAddress, getBalances } from "../agent/wallet.js";
import { getAavePosition } from "../actions/aave.js";
import {
  getTotalRevenue,
  getTotalCosts,
  getRecentActions,
  getRevenueBySource,
  getCostsByCategory,
  getState,
} from "../agent/state.js";
import { attestationHandler } from "./x402-attestation.js";
import { formatUnits, formatEther } from "viem";

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", agent: agentAddress });
});

// Agent status
app.get("/api/status", async (_req, res) => {
  try {
    const balances = await getBalances();
    const aavePosition = await getAavePosition();
    const totalRevenue = getTotalRevenue();
    const totalCosts = getTotalCosts();
    const pnl = totalRevenue - totalCosts;
    const cycleCount = getState("cycle_count") ?? "0";
    const lastCycle = getState("last_cycle") ?? "never";

    res.json({
      agent: agentAddress,
      proofwellContract: config.proofwellContract,
      uptime: {
        cycleCount: parseInt(cycleCount),
        lastCycle,
        loopIntervalMs: config.loopIntervalMs,
      },
      selfSustaining: pnl > 0,
      selfSustainingScore: totalCosts > 0 ? (totalRevenue / totalCosts) : 0,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Balances
app.get("/api/balances", async (_req, res) => {
  try {
    const balances = await getBalances();
    const aavePosition = await getAavePosition();
    const totalUsdc = balances.usdc + aavePosition;

    res.json({
      eth: { raw: balances.eth.toString(), formatted: balances.ethFormatted },
      usdc: { raw: balances.usdc.toString(), formatted: balances.usdcFormatted },
      aUsdc: { raw: aavePosition.toString(), formatted: formatUnits(aavePosition, 6) },
      totalUsdc: { raw: totalUsdc.toString(), formatted: formatUnits(totalUsdc, 6) },
      aavePercent: totalUsdc > 0n ? Number((aavePosition * 100n) / totalUsdc) : 0,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Revenue breakdown
app.get("/api/revenue", (_req, res) => {
  try {
    const total = getTotalRevenue();
    const bySource = getRevenueBySource();
    res.json({ total, bySource });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Cost breakdown
app.get("/api/costs", (_req, res) => {
  try {
    const total = getTotalCosts();
    const byCategory = getCostsByCategory();
    res.json({ total, byCategory });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// P&L
app.get("/api/pnl", (_req, res) => {
  try {
    const revenue = getTotalRevenue();
    const costs = getTotalCosts();
    res.json({
      revenue,
      costs,
      profit: revenue - costs,
      selfSustaining: revenue > costs,
      ratio: costs > 0 ? revenue / costs : 0,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Action log
app.get("/api/actions", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const actions = getRecentActions(limit);
    res.json({ actions });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// x402 attestation (paid endpoint)
app.get("/v1/attestation/:wallet", attestationHandler);

export function startApiServer() {
  app.listen(config.port, () => {
    console.log(`[api] Server running on port ${config.port}`);
    console.log(`[api] Dashboard API: http://localhost:${config.port}/api/status`);
    console.log(`[api] x402 attestation: http://localhost:${config.port}/v1/attestation/:wallet`);
  });
}

export { app };
