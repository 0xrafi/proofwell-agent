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

  useEffect(() => {
    const load = () =>
      fetch(`${API}${path}`)
        .then((r) => r.json())
        .then(setData)
        .catch((e) => setError(e.message));

    load();
    const id = setInterval(load, interval);
    return () => clearInterval(id);
  }, [path, interval]);

  return { data, error };
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 ${className}`}>
      <h3 className="text-sm font-medium text-[var(--text-dim)] mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-dim)]">{label}</div>
      <div className={`text-xl font-mono font-bold ${color || ""}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--text-dim)]">{sub}</div>}
    </div>
  );
}

function SustainabilityGauge({ score }: { score: number }) {
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

export default function Dashboard() {
  const { data: status } = useFetch<Status>("/api/status");
  const { data: balances } = useFetch<Balances>("/api/balances");
  const { data: pnl } = useFetch<PnL>("/api/pnl");
  const { data: revenue } = useFetch<Revenue>("/api/revenue");
  const { data: costs } = useFetch<Costs>("/api/costs");
  const { data: actionsData } = useFetch<{ actions: Action[] }>("/api/actions");

  const actions = actionsData?.actions ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Proofwell Agent</h1>
          <p className="text-[var(--text-dim)] text-sm">
            Autonomous treasury manager on Base mainnet
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
          <span className="text-sm text-[var(--text-dim)]">
            {status ? `Cycle #${status.uptime.cycleCount}` : "Connecting..."}
          </span>
        </div>
      </div>

      {/* Wallet info */}
      {status && (
        <div className="mb-6 text-xs font-mono text-[var(--text-dim)]">
          Agent:{" "}
          <a
            href={`https://basescan.org/address/${status.agent}`}
            target="_blank"
            className="text-[var(--blue)] hover:underline"
          >
            {status.agent}
          </a>
        </div>
      )}

      {/* Self-sustaining score */}
      <Card title="Self-Sustaining Score" className="mb-6">
        <SustainabilityGauge score={pnl ? pnl.ratio : 0} />
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
            <Metric label="ETH" value={balances?.eth.formatted ?? "—"} />
            <Metric label="USDC (wallet)" value={`$${balances?.usdc.formatted ?? "—"}`} />
            <Metric
              label="USDC (Aave)"
              value={`$${balances?.aUsdc.formatted ?? "—"}`}
              sub={balances ? `${balances.aavePercent}% deployed` : undefined}
            />
            <div className="pt-2 border-t border-[var(--border)]">
              <Metric label="Total USDC" value={`$${balances?.totalUsdc.formatted ?? "—"}`} />
            </div>
          </div>
        </Card>

        <Card title="Revenue">
          <Metric
            label="Total"
            value={`$${pnl?.revenue.toFixed(4) ?? "0.0000"}`}
            color="text-[var(--green)]"
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
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-mono font-bold" style={{ color: pnl && pnl.profit >= 0 ? "var(--green)" : "var(--red)" }}>
            {pnl ? `${pnl.profit >= 0 ? "+" : ""}$${pnl.profit.toFixed(4)}` : "$0.0000"}
          </span>
          <span className="text-sm text-[var(--text-dim)]">
            {pnl?.selfSustaining ? "Profitable" : "Pre-revenue"}
          </span>
        </div>
      </Card>

      {/* Action log */}
      <Card title="Action Log">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {actions.length === 0 && (
            <div className="text-sm text-[var(--text-dim)]">No actions yet</div>
          )}
          {actions.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 text-xs py-2 border-b border-[var(--border)] last:border-0"
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
                    href={`https://basescan.org/tx/${a.tx_hash}`}
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
      </Card>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-[var(--text-dim)]">
        Proofwell Agent — Built for ETHDenver 2026 — Base Mainnet
      </div>
    </div>
  );
}
