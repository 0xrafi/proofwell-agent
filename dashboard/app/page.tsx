"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Balances {
  eth: { raw: string; formatted: string };
  usdc: { raw: string; formatted: string };
  aUsdc: { raw: string; formatted: string };
  totalUsdc: { raw: string; formatted: string };
  aavePercent: number;
}

interface PnL {
  revenue: number;
  costs: number;
  profit: number;
  selfSustaining: boolean;
  ratio: number;
}

interface Status {
  agent: string;
  network: string;
  explorerUrl: string;
  proofwellContract: string;
  uptime: { cycleCount: number; lastCycle: string; loopIntervalMs: number };
  selfSustaining: boolean;
  selfSustainingScore: number;
}

interface Action {
  id: number;
  timestamp: string;
  type: string;
  description: string;
  tx_hash: string | null;
  amount_usdc: number;
  success: number;
}

interface Revenue {
  total: number;
  bySource: Array<{ source: string; total: number }>;
}

interface Costs {
  total: number;
  byCategory: Array<{ category: string; total: number }>;
}

function useFetch<T>(path: string, interval = 15000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch(`${API}${path}`)
        .then((r) => r.json())
        .then((d) => {
          setData(d);
          setLoading(false);
        })
        .catch((e) => {
          setError(e.message);
          setLoading(false);
        });

    load();
    const id = setInterval(load, interval);
    return () => clearInterval(id);
  }, [path, interval]);

  return { data, error, loading };
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[var(--border)] ${className}`} />
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 ${className}`}>
      <h3 className="text-sm font-medium text-[var(--text-dim)] mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Metric({ label, value, sub, color, loading }: { label: string; value: string; sub?: string; color?: string; loading?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-dim)]">{label}</div>
      {loading ? (
        <Skeleton className="h-7 w-24 mt-1" />
      ) : (
        <div className={`text-xl font-mono font-bold ${color || ""}`}>{value}</div>
      )}
      {sub && <div className="text-xs text-[var(--text-dim)]">{sub}</div>}
    </div>
  );
}

function NetworkBadge({ network }: { network: string }) {
  const isTestnet = network.includes("sepolia");
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        isTestnet
          ? "bg-yellow-500/10 text-[var(--yellow)] border border-yellow-500/20"
          : "bg-blue-500/10 text-[var(--blue)] border border-blue-500/20"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isTestnet ? "bg-[var(--yellow)]" : "bg-[var(--blue)]"}`} />
      {network === "base-sepolia" ? "Base Sepolia" : "Base Mainnet"}
    </span>
  );
}

function SustainabilityGauge({ score, loading }: { score: number; loading?: boolean }) {
  if (loading) return <Skeleton className="h-3 w-full" />;
  const pct = Math.min(score * 100, 200);
  const color = score >= 1 ? "var(--green)" : score > 0.5 ? "var(--yellow)" : "var(--red)";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
      <span className="font-mono text-sm" style={{ color }}>
        {score >= 1 ? `${score.toFixed(1)}x` : `${(score * 100).toFixed(0)}%`}
      </span>
    </div>
  );
}

function HowItWorks() {
  return (
    <Card title="How It Works" className="mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="font-medium text-[var(--text)] mb-1">1. Users stake on screen time</div>
          <div className="text-[var(--text-dim)]">
            Stake crypto on your daily screen time goal. Miss it? 40% gets slashed to the treasury.
          </div>
        </div>
        <div>
          <div className="font-medium text-[var(--text)] mb-1">2. Agent collects + deploys</div>
          <div className="text-[var(--text-dim)]">
            Autonomous agent resolves expired stakes, deposits idle funds to Aave V3 for yield.
          </div>
        </div>
        <div>
          <div className="font-medium text-[var(--text)] mb-1">3. Self-sustaining loop</div>
          <div className="text-[var(--text-dim)]">
            Revenue from forfeitures + Aave yield + x402 attestation fees covers all compute costs.
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: status, loading: statusLoading } = useFetch<Status>("/api/status");
  const { data: balances, loading: balancesLoading } = useFetch<Balances>("/api/balances");
  const { data: pnl, loading: pnlLoading } = useFetch<PnL>("/api/pnl");
  const { data: revenue } = useFetch<Revenue>("/api/revenue");
  const { data: costs } = useFetch<Costs>("/api/costs");
  const { data: actionsData, loading: actionsLoading } = useFetch<{ actions: Action[] }>("/api/actions");

  const actions = actionsData?.actions ?? [];
  const explorerUrl = status?.explorerUrl ?? "https://basescan.org";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Proofwell Agent</h1>
          <p className="text-[var(--text-dim)] text-sm">
            Autonomous treasury manager on Base
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status && <NetworkBadge network={status.network} />}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status ? "bg-[var(--green)]" : statusLoading ? "bg-[var(--yellow)] animate-pulse" : "bg-[var(--red)]"}`} />
            <span className="text-sm text-[var(--text-dim)]">
              {status ? `Cycle #${status.uptime.cycleCount}` : statusLoading ? "Connecting..." : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* Wallet info */}
      <div className="mb-6 text-xs font-mono text-[var(--text-dim)]">
        {status ? (
          <>
            Agent:{" "}
            <a
              href={`${explorerUrl}/address/${status.agent}`}
              target="_blank"
              className="text-[var(--blue)] hover:underline"
            >
              {status.agent}
            </a>
            <span className="mx-2">|</span>
            Contract:{" "}
            <a
              href={`${explorerUrl}/address/${status.proofwellContract}`}
              target="_blank"
              className="text-[var(--blue)] hover:underline"
            >
              {status.proofwellContract.slice(0, 10)}...{status.proofwellContract.slice(-8)}
            </a>
          </>
        ) : (
          <Skeleton className="h-4 w-96" />
        )}
      </div>

      {/* How It Works */}
      <HowItWorks />

      {/* Self-sustaining score */}
      <Card title="Self-Sustaining Score" className="mb-6">
        <SustainabilityGauge score={pnl ? pnl.ratio : 0} loading={pnlLoading} />
        <p className="text-xs text-[var(--text-dim)] mt-2">
          {pnl?.selfSustaining
            ? "Agent is profitable — revenue exceeds costs"
            : "Agent is not yet self-sustaining — building toward profitability"}
        </p>
      </Card>

      {/* Balance + P&L row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card title="Balances">
          <div className="space-y-3">
            <Metric label="ETH" value={balances?.eth.formatted ?? "—"} loading={balancesLoading} />
            <Metric label="USDC (wallet)" value={`$${balances?.usdc.formatted ?? "—"}`} loading={balancesLoading} />
            <Metric
              label="USDC (Aave)"
              value={`$${balances?.aUsdc.formatted ?? "—"}`}
              sub={balances ? `${balances.aavePercent}% deployed` : undefined}
              loading={balancesLoading}
            />
            <div className="pt-2 border-t border-[var(--border)]">
              <Metric label="Total USDC" value={`$${balances?.totalUsdc.formatted ?? "—"}`} loading={balancesLoading} />
            </div>
          </div>
        </Card>

        <Card title="Revenue">
          <Metric
            label="Total"
            value={`$${pnl?.revenue.toFixed(4) ?? "0.0000"}`}
            color="text-[var(--green)]"
            loading={pnlLoading}
          />
          <div className="mt-3 space-y-1">
            {revenue?.bySource.map((s) => (
              <div key={s.source} className="flex justify-between text-xs">
                <span className="text-[var(--text-dim)]">{s.source}</span>
                <span className="font-mono">${s.total.toFixed(4)}</span>
              </div>
            ))}
            {(!revenue?.bySource.length) && (
              <div className="text-xs text-[var(--text-dim)]">No revenue yet</div>
            )}
          </div>
        </Card>

        <Card title="Costs">
          <Metric
            label="Total"
            value={`$${pnl?.costs.toFixed(4) ?? "0.0000"}`}
            color="text-[var(--red)]"
            loading={pnlLoading}
          />
          <div className="mt-3 space-y-1">
            {costs?.byCategory.map((c) => (
              <div key={c.category} className="flex justify-between text-xs">
                <span className="text-[var(--text-dim)]">{c.category}</span>
                <span className="font-mono">${c.total.toFixed(4)}</span>
              </div>
            ))}
            {(!costs?.byCategory.length) && (
              <div className="text-xs text-[var(--text-dim)]">No costs yet</div>
            )}
          </div>
        </Card>
      </div>

      {/* P&L ticker */}
      <Card title="P&L" className="mb-6">
        {pnlLoading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <div className="flex items-baseline gap-4">
            <span className="text-3xl font-mono font-bold" style={{ color: pnl && pnl.profit >= 0 ? "var(--green)" : "var(--red)" }}>
              {pnl ? `${pnl.profit >= 0 ? "+" : ""}$${pnl.profit.toFixed(4)}` : "$0.0000"}
            </span>
            <span className="text-sm text-[var(--text-dim)]">
              {pnl?.selfSustaining ? "Profitable" : "Pre-revenue"}
            </span>
          </div>
        )}
      </Card>

      {/* x402 Attestation panel */}
      <Card title="x402 Behavioral Attestation" className="mb-6">
        <div className="text-sm text-[var(--text-dim)] mb-3">
          Other DeFi protocols pay to ask: <span className="text-[var(--text)] font-medium">"Is this wallet holder disciplined?"</span>
        </div>
        <div className="bg-[var(--bg)] rounded-md p-3 font-mono text-xs overflow-x-auto">
          <span className="text-[var(--green)]">GET</span>{" "}
          <span className="text-[var(--blue)]">/v1/attestation/0x...</span>
          <div className="mt-2 text-[var(--text-dim)]">
            {`{ "wallet": "0x...", "disciplineScore": 0.85, "totalStakes": 3, "successRate": 0.67, "attestedAt": "..." }`}
          </div>
        </div>
        <div className="mt-2 text-xs text-[var(--text-dim)]">
          0.01 USDC per query via x402 payment protocol
        </div>
      </Card>

      {/* Action log */}
      <Card title="Action Log">
        {actionsLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {actions.length === 0 && (
              <div className="text-sm text-[var(--text-dim)]">No actions yet — agent will log activity here</div>
            )}
            {actions.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 text-xs py-2 border-b border-[var(--border)] last:border-0 animate-[fadeIn_0.3s_ease-in]"
              >
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.success ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{a.type}</span>
                    <span className="text-[var(--text-dim)]">
                      {new Date(a.timestamp + "Z").toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[var(--text-dim)] truncate">{a.description}</div>
                  {a.tx_hash && (
                    <a
                      href={`${explorerUrl}/tx/${a.tx_hash}`}
                      target="_blank"
                      className="text-[var(--blue)] hover:underline"
                    >
                      {a.tx_hash.slice(0, 16)}...
                    </a>
                  )}
                </div>
                {a.amount_usdc > 0 && (
                  <span className="font-mono text-[var(--green)]">${a.amount_usdc.toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-[var(--text-dim)]">
        Proofwell Agent — Built for ETHDenver 2026 — {status?.network === "base-sepolia" ? "Base Sepolia Testnet" : "Base Mainnet"}
      </div>
    </div>
  );
}
