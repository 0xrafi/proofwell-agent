import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { agentAddress, getBalances } from "../agent/wallet.js";
import { getAavePosition } from "../actions/aave.js";
import {
  getTotalRevenue,
  getTotalCosts,
  getRecentActions,
  getRevenueBySource,
  getCostsByCategory,
  getFinancialHistory,
  getState,
} from "../agent/state.js";
import { attestationHandler } from "./x402-attestation.js";
import { formatUnits, formatEther } from "viem";

const app = express();
app.use(cors());
app.use(express.json());

const attestationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, try again later" },
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, try again later" },
});

app.use(globalLimiter);

const startedAt = new Date().toISOString();

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", agent: agentAddress, network: config.network });
});

// Agent status
app.get("/api/status", async (_req, res) => {
  try {
    const totalRevenue = getTotalRevenue();
    const totalCosts = getTotalCosts();
    const pnl = totalRevenue - totalCosts;
    const cycleCount = getState("cycle_count") ?? "0";
    const lastCycle = getState("last_cycle") ?? "never";

    res.json({
      agent: agentAddress,
      network: config.network,
      explorerUrl: config.explorerUrl,
      proofwellContract: config.proofwellContract,
      uptime: {
        cycleCount: parseInt(cycleCount),
        lastCycle,
        startedAt,
        loopIntervalMs: config.loopIntervalMs,
      },
      selfSustaining: pnl > 0,
      selfSustainingScore: totalCosts > 0 ? (totalRevenue / totalCosts) : 0,
    });
  } catch (e: any) {
    console.error(`[api] Error:`, e.message);
    res.status(500).json({ error: "Internal server error" });
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
    console.error(`[api] Error:`, e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Revenue breakdown
app.get("/api/revenue", (_req, res) => {
  try {
    const total = getTotalRevenue();
    const bySource = getRevenueBySource();
    res.json({ total, bySource });
  } catch (e: any) {
    console.error(`[api] Error:`, e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Cost breakdown
app.get("/api/costs", (_req, res) => {
  try {
    const total = getTotalCosts();
    const byCategory = getCostsByCategory();
    res.json({ total, byCategory });
  } catch (e: any) {
    console.error(`[api] Error:`, e.message);
    res.status(500).json({ error: "Internal server error" });
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
    console.error(`[api] Error:`, e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Action log
app.get("/api/actions", (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 500);
    const actions = getRecentActions(limit);
    res.json({ actions });
  } catch (e: any) {
    console.error(`[api] Error:`, e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Financial history for charts
app.get("/api/history", (_req, res) => {
  try {
    const history = getFinancialHistory();
    res.json({ history });
  } catch (e: any) {
    console.error(`[api] Error:`, e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// x402 attestation (paid endpoint)
app.get("/v1/attestation/:wallet", attestationLimiter, attestationHandler);

// Global error handler — catch anything that slips through
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

export function startApiServer() {
  app.listen(config.port, () => {
    console.log(`[api] Server running on port ${config.port} (${config.network})`);
    console.log(`[api] Dashboard API: http://localhost:${config.port}/api/status`);
    console.log(`[api] x402 attestation: http://localhost:${config.port}/v1/attestation/:wallet`);
  });
}

export { app };
