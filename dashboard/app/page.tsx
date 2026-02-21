"use client";

import { useEffect, useState, useMemo } from "react";

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
  uptime: { cycleCount: number; lastCycle: string; startedAt?: string; loopIntervalMs: number };
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

interface HistoryPoint {
  timestamp: string;
  cumulative_revenue: number;
  cumulative_costs: number;
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

function SustainabilityGauge({ score, pnl, loading }: { score: number; pnl: PnL | null; loading?: boolean }) {
  if (loading) return <Skeleton className="h-20 w-full" />;
  const pct = Math.min(score * 100, 200);
  const color = score >= 1 ? "var(--green)" : score > 0.5 ? "var(--yellow)" : "var(--red)";
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-mono font-bold" style={{ color }}>
            {score >= 1 ? `${score.toFixed(1)}x` : `${(score * 100).toFixed(0)}%`}
          </span>
          <span className="text-sm text-[var(--text-dim)]">
            {score >= 1 ? "Self-sustaining" : score > 0 ? "Building toward sustainability" : "Tracking costs"}
          </span>
        </div>
        {pnl && (
          <span className="text-2xl font-mono font-bold" style={{ color: pnl.profit >= 0 ? "var(--green)" : "var(--red)" }}>
            {pnl.profit >= 0 ? "+" : ""}${pnl.profit.toFixed(4)}
          </span>
        )}
      </div>
      <div className="h-3 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
      <div className="flex justify-between mt-1 text-xs text-[var(--text-dim)]">
        <span>Revenue: ${pnl?.revenue.toFixed(4) ?? "0"}</span>
        <span>Costs: ${pnl?.costs.toFixed(4) ?? "0"}</span>
      </div>
    </div>
  );
}

function Uptime({ status }: { status: Status | null }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!status) return null;

  const startedAt = status.uptime.startedAt;
  const uptimeMs = startedAt ? now - new Date(startedAt).getTime() : 0;
  const hours = Math.floor(uptimeMs / 3600000);
  const mins = Math.floor((uptimeMs % 3600000) / 60000);
  const secs = Math.floor((uptimeMs % 60000) / 1000);
  const uptimeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m ${secs}s`;

  const lastCycleAgo = status.uptime.lastCycle !== "never"
    ? Math.floor((now - new Date(status.uptime.lastCycle).getTime()) / 1000)
    : null;

  return (
    <div className="flex items-center gap-4 text-xs text-[var(--text-dim)]">
      <span>Uptime: {uptimeStr}</span>
      <span>Cycles: {status.uptime.cycleCount}</span>
      {lastCycleAgo !== null && <span>Last cycle: {lastCycleAgo}s ago</span>}
      <span>Interval: {status.uptime.loopIntervalMs / 1000}s</span>
    </div>
  );
}

/** SVG chart of cumulative revenue vs costs over time */
function FinancialChart({ history }: { history: HistoryPoint[] }) {
  const { width, height, padding } = { width: 600, height: 200, padding: { top: 20, right: 20, bottom: 30, left: 50 } };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const { maxVal, points } = useMemo(() => {
    if (history.length === 0) return { maxVal: 0.001, points: [] };
    const maxVal = Math.max(
      ...history.map((h) => Math.max(h.cumulative_revenue, h.cumulative_costs)),
      0.001
    );
    return { maxVal, points: history };
  }, [history]);

  if (points.length < 2) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-[var(--text-dim)]">
        Chart populates as revenue and cost events accumulate
      </div>
    );
  }

  const xScale = (i: number) => padding.left + (i / (points.length - 1)) * chartW;
  const yScale = (v: number) => padding.top + chartH - (v / (maxVal * 1.1)) * chartH;

  const revenueLine = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(p.cumulative_revenue)}`).join(" ");
  const costsLine = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(p.cumulative_costs)}`).join(" ");

  // Y-axis labels
  const yLabels = [0, maxVal * 0.5, maxVal].map((v) => ({
    y: yScale(v),
    label: `$${v.toFixed(v < 0.01 ? 4 : 2)}`,
  }));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Grid lines */}
      {yLabels.map((l, i) => (
        <g key={i}>
          <line x1={padding.left} y1={l.y} x2={width - padding.right} y2={l.y} stroke="var(--border)" strokeWidth="1" />
          <text x={padding.left - 5} y={l.y + 4} textAnchor="end" fill="var(--text-dim)" fontSize="10" fontFamily="monospace">
            {l.label}
          </text>
        </g>
      ))}

      {/* Revenue line */}
      <path d={revenueLine} fill="none" stroke="var(--green)" strokeWidth="2" />
      {/* Costs line */}
      <path d={costsLine} fill="none" stroke="var(--red)" strokeWidth="2" strokeDasharray="4 2" />

      {/* Revenue fill */}
      <path
        d={`${revenueLine} L ${xScale(points.length - 1)} ${yScale(0)} L ${xScale(0)} ${yScale(0)} Z`}
        fill="var(--green)"
        opacity="0.1"
      />

      {/* Legend */}
      <g transform={`translate(${padding.left + 10}, ${padding.top})`}>
        <line x1="0" y1="0" x2="16" y2="0" stroke="var(--green)" strokeWidth="2" />
        <text x="20" y="4" fill="var(--text-dim)" fontSize="10">Revenue</text>
        <line x1="70" y1="0" x2="86" y2="0" stroke="var(--red)" strokeWidth="2" strokeDasharray="4 2" />
        <text x="90" y="4" fill="var(--text-dim)" fontSize="10">Costs</text>
      </g>
    </svg>
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

const SOURCE_LABELS: Record<string, string> = {
  treasury_slash: "Forfeitures",
  aave_yield: "Aave Yield",
  x402_attestation: "x402 Queries",
};

const COST_LABELS: Record<string, string> = {
  compute: "Compute (Railway)",
  gas: "Gas (Base L2)",
  llm: "LLM (GPT-4o-mini)",
};

const ACTION_COLORS: Record<string, string> = {
  startup: "bg-[var(--blue)]",
  aave_supply: "bg-[var(--green)]",
  aave_yield: "bg-[var(--green)]",
  llm_deposit: "bg-[var(--green)]",
  llm_withdraw: "bg-[var(--yellow)]",
  resolve_expired: "bg-purple-400",
  warning: "bg-[var(--yellow)]",
  cycle_error: "bg-[var(--red)]",
};

function AttestationDemo({ apiBase }: { apiBase: string }) {
  const [wallet, setWallet] = useState("0xc59E6289C3f53009B9fFB7B1d3D9Be9F7aA0e472");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${apiBase}/v1/attestation/${wallet}`);
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="x402 Behavioral Attestation — Live Demo" className="mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-[var(--text-dim)] mb-3">
            Novel revenue stream: other DeFi protocols pay to query{" "}
            <span className="text-[var(--text)] font-medium">&ldquo;Is this wallet holder disciplined?&rdquo;</span>
          </div>
          <div className="text-xs text-[var(--text-dim)] space-y-1 mb-3">
            <div>Use cases: undercollateralized lending, insurance pricing, reputation</div>
            <div>Price: 0.01 USDC/query via x402 payment protocol</div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="0x..."
              className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 font-mono text-xs text-[var(--text)]"
            />
            <button
              onClick={query}
              disabled={loading}
              className="px-3 py-1.5 bg-[var(--blue)] text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "..." : "Query"}
            </button>
          </div>
        </div>
        <div className="bg-[var(--bg)] rounded-md p-3 font-mono text-xs overflow-x-auto">
          <div className="mb-1">
            <span className="text-[var(--green)]">GET</span>{" "}
            <span className="text-[var(--blue)]">/v1/attestation/{wallet.slice(0, 10)}...</span>
          </div>
          {error && <div className="text-[var(--red)]">Error: {error}</div>}
          {result && (
            <pre className="text-[var(--text-dim)] whitespace-pre">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
          {!result && !error && (
            <div className="text-[var(--text-dim)]">Click &ldquo;Query&rdquo; to fetch live attestation data</div>
          )}
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
  const { data: historyData } = useFetch<{ history: HistoryPoint[] }>("/api/history", 30000);

  const actions = actionsData?.actions ?? [];
  const explorerUrl = status?.explorerUrl ?? "https://basescan.org";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Proofwell Agent</h1>
          <p className="text-[var(--text-dim)] text-sm">
            Autonomous treasury agent on Base — earns from human screen time failures
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status && <NetworkBadge network={status.network} />}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status ? "bg-[var(--green)] animate-pulse" : statusLoading ? "bg-[var(--yellow)] animate-pulse" : "bg-[var(--red)]"}`} />
            <span className="text-sm font-medium" style={{ color: status ? "var(--green)" : "var(--text-dim)" }}>
              {status ? "Live" : statusLoading ? "Connecting..." : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* Wallet info + uptime */}
      <div className="mb-6 space-y-1">
        <div className="text-xs font-mono text-[var(--text-dim)]">
          {status ? (
            <>
              Agent:{" "}
              <a href={`${explorerUrl}/address/${status.agent}`} target="_blank" className="text-[var(--blue)] hover:underline">
                {status.agent}
              </a>
              <span className="mx-2">|</span>
              Contract:{" "}
              <a href={`${explorerUrl}/address/${status.proofwellContract}`} target="_blank" className="text-[var(--blue)] hover:underline">
                {status.proofwellContract.slice(0, 10)}...{status.proofwellContract.slice(-8)}
              </a>
            </>
          ) : (
            <Skeleton className="h-4 w-96" />
          )}
        </div>
        <Uptime status={status} />
      </div>

      {/* How It Works — above the fold */}
      <HowItWorks />

      {/* Self-sustaining score — the hero metric */}
      <Card title="Self-Sustaining Score" className="mb-6">
        <SustainabilityGauge score={pnl ? pnl.ratio : 0} pnl={pnl} loading={pnlLoading} />
      </Card>

      {/* Revenue vs Costs chart */}
      <Card title="Revenue vs Costs Over Time" className="mb-6">
        <FinancialChart history={historyData?.history ?? []} />
      </Card>

      {/* Balance + Revenue + Costs row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card title="Treasury Balances">
          <div className="space-y-3">
            <Metric label="ETH (gas)" value={balances?.eth.formatted ?? "---"} loading={balancesLoading} />
            <Metric label="USDC (liquid)" value={`$${balances?.usdc.formatted ?? "---"}`} loading={balancesLoading} />
            <Metric
              label="USDC (Aave V3)"
              value={`$${balances?.aUsdc.formatted ?? "---"}`}
              sub={balances ? `${balances.aavePercent}% deployed for yield` : undefined}
              loading={balancesLoading}
            />
            <div className="pt-2 border-t border-[var(--border)]">
              <Metric label="Total AUM" value={`$${balances?.totalUsdc.formatted ?? "---"}`} loading={balancesLoading} />
            </div>
          </div>
        </Card>

        <Card title="Revenue Streams">
          <Metric
            label="Total Revenue"
            value={`$${pnl?.revenue.toFixed(4) ?? "0.0000"}`}
            color="text-[var(--green)]"
            loading={pnlLoading}
          />
          <div className="mt-3 space-y-2">
            {revenue?.bySource.map((s) => (
              <div key={s.source} className="flex justify-between text-xs">
                <span className="text-[var(--text-dim)]">{SOURCE_LABELS[s.source] ?? s.source}</span>
                <span className="font-mono text-[var(--green)]">${s.total.toFixed(4)}</span>
              </div>
            ))}
            {(!revenue?.bySource.length) && (
              <div className="text-xs text-[var(--text-dim)]">Accruing yield from Aave V3...</div>
            )}
          </div>
        </Card>

        <Card title="Operating Costs">
          <Metric
            label="Total Costs"
            value={`$${pnl?.costs.toFixed(4) ?? "0.0000"}`}
            color="text-[var(--red)]"
            loading={pnlLoading}
          />
          <div className="mt-3 space-y-2">
            {costs?.byCategory.map((c) => (
              <div key={c.category} className="flex justify-between text-xs">
                <span className="text-[var(--text-dim)]">{COST_LABELS[c.category] ?? c.category}</span>
                <span className="font-mono text-[var(--red)]">${c.total.toFixed(4)}</span>
              </div>
            ))}
            {(!costs?.byCategory.length) && (
              <div className="text-xs text-[var(--text-dim)]">Tracking compute + gas costs...</div>
            )}
          </div>
        </Card>
      </div>

      {/* Builder Code (ERC-8021) */}
      <Card title="On-Chain Builder Attribution (ERC-8021)" className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-[var(--text-dim)] mb-3">
              Every transaction the agent sends includes a builder code in calldata, making it
              verifiable on-chain that this agent built the transaction.
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-dim)]">Builder code:</span>
                <span className="font-mono text-[var(--text)] font-medium bg-[var(--bg)] px-2 py-0.5 rounded">proofwell</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-dim)]">Suffix:</span>
                <span className="font-mono text-[var(--blue)]">70726f6f6677656c6c</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <a
              href={`${explorerUrl}/address/${status?.agent}`}
              target="_blank"
              className="text-[var(--blue)] hover:underline"
            >
              View all agent transactions on BaseScan &rarr;
            </a>
            <div className="text-[var(--text-dim)]">
              Look at any tx input data — it ends with <span className="font-mono">70726f6f6677656c6c</span> ("proofwell" in hex).
              This proves the agent authored the transaction per the ERC-8021 builder code standard.
            </div>
          </div>
        </div>
      </Card>

      {/* x402 Attestation panel — live demo */}
      <AttestationDemo apiBase={API} />

      {/* Action log */}
      <Card title={`Action Log (${actions.length} events)`}>
        {actionsLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {actions.length === 0 && (
              <div className="text-sm text-[var(--text-dim)]">Agent is running — actions will appear here</div>
            )}
            {actions.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 text-xs py-2 border-b border-[var(--border)] last:border-0"
              >
                <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${a.success ? (ACTION_COLORS[a.type] ?? "bg-[var(--green)]") : "bg-[var(--red)]"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-[var(--text)]">{a.type}</span>
                    <span className="text-[var(--text-dim)]">
                      {new Date(a.timestamp + "Z").toLocaleString()}
                    </span>
                    {a.tx_hash && (
                      <a
                        href={`${explorerUrl}/tx/${a.tx_hash}`}
                        target="_blank"
                        className="text-[var(--blue)] hover:underline"
                      >
                        tx:{a.tx_hash.slice(0, 10)}...
                      </a>
                    )}
                  </div>
                  <div className="text-[var(--text-dim)]">{a.description}</div>
                </div>
                {a.amount_usdc > 0 && (
                  <span className="font-mono text-[var(--green)] flex-shrink-0">${a.amount_usdc.toFixed(4)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Footer */}
      <div className="mt-8 flex items-center justify-between text-xs text-[var(--text-dim)]">
        <span>Proofwell Agent — ETHDenver 2026</span>
        <div className="flex items-center gap-3">
          <a href={`${explorerUrl}/address/${status?.agent}`} target="_blank" className="text-[var(--blue)] hover:underline">
            BaseScan
          </a>
          <a href="https://github.com/0xrafi/proofwell-agent" target="_blank" className="text-[var(--blue)] hover:underline">
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
