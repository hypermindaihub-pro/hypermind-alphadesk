"use client";

// Institutional instrumentation widgets for the five bespoke views. Each widget
// derives from real desk state where available and falls back to deterministic,
// clearly-labelled *simulated* series (src/lib/ui/market-mock) where there is no
// backend feed yet. Nothing here calls a backend, mutates state, or relabels
// simulated data as live exchange data.

import {
  BrainCircuit,
  CircleGauge,
  Clock3,
  Gauge,
  Network,
  Radar,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { formatPct, formatUsd, formatUtcDateTime } from "@/lib/format";
import {
  drawdownSeries,
  pairCorrelation,
  seedFrom,
  sentimentScore,
  volatilityPct,
  walk,
} from "@/lib/ui/market-mock";
import { StatusChip } from "../status-chip";
import { Gauge as RadialGauge, Sparkline, StateBadge, TerminalPanel } from "../trading-ui";
import { useDesk } from "./desk-context";

// ---------------------------------------------------------------------------
// shared atoms
// ---------------------------------------------------------------------------

function changeTone(change: number) {
  return change >= 0 ? "positive" : "danger";
}

function HBar({ value, max, tone = "positive" }: { value: number; max: number; tone?: "positive" | "danger" | "warning" | "info" }) {
  const pct = Math.max(2, Math.min(100, (value / Math.max(max, 0.0001)) * 100));
  const c = {
    positive: "from-emerald-500/70 to-emerald-300",
    danger: "from-rose-500/70 to-rose-300",
    warning: "from-amber-500/70 to-amber-300",
    info: "from-sky-500/70 to-sky-300",
  }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className={`h-full rounded-full bg-gradient-to-r ${c}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Stat({ label, value, tone = "neutral", sub }: { label: string; value: string; tone?: "neutral" | "positive" | "danger" | "warning" | "info"; sub?: string }) {
  const c = {
    neutral: "text-zinc-100",
    positive: "text-emerald-300",
    danger: "text-rose-300",
    warning: "text-amber-300",
    info: "text-sky-300",
  }[tone];
  return (
    <div className="bg-[--ad-surface] px-3 py-2.5">
      <p className="ad-eyebrow truncate">{label}</p>
      <p className={`mt-1 font-mono text-base font-semibold tabular-nums ${c}`}>{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[10px] text-zinc-600">{sub}</p> : null}
    </div>
  );
}

// Simulated coverage universe used by the market-map / correlation widgets.
const UNIVERSE = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "DOGE", "LINK", "DOT", "ATOM", "ARB"] as const;

type SimAsset = { symbol: string; change: number; weight: number; vol: number; sentiment: number };

function simUniverse(): SimAsset[] {
  return UNIVERSE.map((symbol) => {
    const s = seedFrom(symbol);
    const change = Math.round((s * 2 - 1) * 9 * 100) / 100;
    return {
      symbol,
      change,
      weight: 0.3 + seedFrom(`${symbol}w`),
      vol: volatilityPct(symbol, change),
      sentiment: sentimentScore(symbol, change),
    };
  });
}

// ===========================================================================
// 1 · MARKET INTELLIGENCE
// ===========================================================================

export function MarketIntelligenceWidgets() {
  const { marketData } = useDesk();
  const uni = simUniverse();
  const positive = uni.filter((a) => a.change >= 0).length;
  const breadth = positive / uni.length;
  const regime =
    breadth >= 0.6
      ? { label: "Risk-On", tone: "positive" as const }
      : breadth <= 0.4
        ? { label: "Risk-Off", tone: "danger" as const }
        : { label: "Neutral", tone: "warning" as const };
  const regimeHistory = walk(seedFrom("regime"), 28, 55, 0.08);
  const corrSyms = uni.slice(0, 7).map((a) => a.symbol);
  const opportunities = [...uni]
    .map((a) => ({ ...a, score: Math.round((a.sentiment * 0.6 + (a.change + 9) * 2 + a.vol * 0.2)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TerminalPanel
          eyebrow="Market map"
          title="Market heatmap"
          description="Simulated coverage universe, sized by weight and shaded by 24h move. Live CoinGecko prices appear in the scanner below."
          action={<StateBadge tone={regime.tone}>{regime.label}</StateBadge>}
        >
          <div className="grid grid-cols-3 gap-1.5 p-3 sm:grid-cols-4">
            {uni.map((a) => {
              const intensity = Math.min(0.32, Math.abs(a.change) / 28);
              const bg = a.change >= 0 ? `rgba(52,211,153,${0.06 + intensity})` : `rgba(251,113,133,${0.06 + intensity})`;
              return (
                <div
                  key={a.symbol}
                  className="rounded-lg border border-white/[0.06] p-2.5 transition hover:border-white/15"
                  style={{ background: bg }}
                >
                  <p className="font-mono text-xs font-semibold text-zinc-100">{a.symbol}</p>
                  <p className={`mt-1 font-mono text-[11px] tabular-nums ${a.change >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {formatPct(a.change)}
                  </p>
                </div>
              );
            })}
          </div>
        </TerminalPanel>

        <TerminalPanel eyebrow="Regime detection" title="Market regime" description="Breadth-weighted risk regime with trailing signal.">
          <div className="flex items-center justify-between gap-4 px-4 pb-2 pt-4">
            <div>
              <StateBadge tone={regime.tone}>{regime.label}</StateBadge>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-zinc-50">
                {Math.round(breadth * 100)}%
              </p>
              <p className="text-[11px] text-zinc-500">{positive}/{uni.length} assets advancing</p>
            </div>
            <Radar aria-hidden className="size-9 text-zinc-700" strokeWidth={1.2} />
          </div>
          <Sparkline data={regimeHistory} tone={regime.tone === "danger" ? "danger" : "positive"} fill className="h-14 w-full px-2 pb-3" />
        </TerminalPanel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <TerminalPanel eyebrow="Volatility" title="Volatility monitor" description="Simulated annualised volatility proxy per asset.">
          <div className="space-y-2.5 p-4">
            {uni.slice(0, 6).map((a) => (
              <div key={a.symbol} className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-mono text-[11px] text-zinc-300">{a.symbol}</span>
                <HBar value={a.vol} max={70} tone={a.vol > 45 ? "danger" : a.vol > 30 ? "warning" : "info"} />
                <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-400">{a.vol}%</span>
              </div>
            ))}
          </div>
        </TerminalPanel>

        <TerminalPanel eyebrow="Sentiment" title="Sentiment indicators" description="Composite 0–100 sentiment, simulated from momentum.">
          <div className="grid grid-cols-2 gap-px overflow-hidden border-t border-white/[0.06] bg-white/[0.05] sm:grid-cols-3">
            {uni.slice(0, 6).map((a) => (
              <div key={a.symbol} className="bg-[--ad-surface] px-3 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-zinc-300">{a.symbol}</span>
                  <span className={`font-mono text-[11px] tabular-nums ${a.sentiment >= 60 ? "text-emerald-300" : a.sentiment <= 40 ? "text-rose-300" : "text-amber-300"}`}>
                    {a.sentiment}
                  </span>
                </div>
                <div className="mt-2">
                  <HBar value={a.sentiment} max={100} tone={a.sentiment >= 60 ? "positive" : a.sentiment <= 40 ? "danger" : "warning"} />
                </div>
              </div>
            ))}
          </div>
        </TerminalPanel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <TerminalPanel
          eyebrow="AI scanner"
          title="AI opportunity scanner"
          description="Ranked setups by composite momentum, sentiment, and volatility. Advisory only — not execution."
          action={<StatusChip label={`${opportunities.length} candidates`} tone="neutral" />}
        >
          <div className="divide-y divide-white/[0.06]">
            {opportunities.map((o, i) => (
              <div key={o.symbol} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-md border border-white/[0.08] font-mono text-[10px] text-zinc-500">{i + 1}</span>
                <span className="w-14 shrink-0 font-mono text-xs font-semibold text-zinc-100">{o.symbol}</span>
                <StateBadge tone={changeTone(o.change)}>{o.change >= 0 ? "long bias" : "short bias"}</StateBadge>
                <div className="min-w-0 flex-1"><HBar value={o.score} max={120} tone="info" /></div>
                <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-sky-300">{o.score}</span>
              </div>
            ))}
          </div>
        </TerminalPanel>

        <TerminalPanel eyebrow="Correlation" title="Correlation matrix" description="Simulated pairwise correlation across the top coverage set.">
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[360px] border-separate border-spacing-1 text-center">
              <thead>
                <tr>
                  <th className="w-8" />
                  {corrSyms.map((s) => (
                    <th key={s} className="font-mono text-[9px] font-medium text-zinc-500" scope="col">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corrSyms.map((row) => (
                  <tr key={row}>
                    <th className="text-right font-mono text-[9px] font-medium text-zinc-500" scope="row">{row}</th>
                    {corrSyms.map((col) => {
                      const c = pairCorrelation(row, col);
                      const a = Math.min(0.5, Math.abs(c) * 0.5);
                      const bg = c >= 0 ? `rgba(52,211,153,${a})` : `rgba(251,113,133,${a})`;
                      return (
                        <td key={col} className="rounded font-mono text-[9px] tabular-nums text-zinc-200" style={{ background: bg }}>
                          {c.toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-white/[0.06] px-4 py-2 text-[10px] text-zinc-600">
            Source: {marketData.status.provider} live for prices · correlation simulated for illustration.
          </p>
        </TerminalPanel>
      </div>
    </div>
  );
}

// ===========================================================================
// 2 · AGENT WORKSPACE
// ===========================================================================

export function AgentWorkspaceWidgets() {
  const { agentWorkbench, costUsage, journal, config, forecastCalibration } = useDesk();
  const runs = agentWorkbench?.runs ?? [];
  const tokenHistory = walk(seedFrom("tokens"), 20, costUsage.estimatedInputTokens + costUsage.estimatedOutputTokens, 0.12);
  const costHistory = walk(seedFrom("cost"), 20, Math.max(0.0008, costUsage.estimatedCostUsd), 0.18);
  const budgetUsedPct = Math.min(100, (costUsage.estimatedCostUsd / Math.max(costUsage.dailyBudgetUsd, 0.0001)) * 100);
  const timeline = journal.slice(0, 7);
  const models = [
    { model: config.openAiModel, role: "Primary reasoning", state: "active" as const },
    { model: "deterministic-fallback", role: "Offline guarantee", state: "standby" as const },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TerminalPanel eyebrow="Reasoning" title="Reasoning traces" description="Per-agent thought trace from the latest workbench run.">
          {runs.length ? (
            <div className="space-y-3 p-4">
              {runs.map((run, i) => (
                <div key={run.role} className="relative pl-6">
                  <span className="absolute left-0 top-1 grid size-4 place-items-center rounded-full border border-[--ad-accent]/40 bg-[--ad-accent]/10 font-mono text-[9px] text-[--ad-accent]">{i + 1}</span>
                  {i < runs.length - 1 ? <span className="absolute left-2 top-5 h-[calc(100%-4px)] w-px bg-white/10" /> : null}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-zinc-200">{run.title}</p>
                    <span className="font-mono text-[10px] tabular-nums text-sky-300">{Math.round(run.confidence * 100)}%</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-500">{run.summary}</p>
                  {run.bullets?.[0] ? <p className="mt-1 text-[10px] text-zinc-600">→ {run.bullets[0]}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="p-4 text-xs leading-5 text-zinc-500">Run the agents to capture a reasoning trace. Until then this stays empty — no fabricated output.</p>
          )}
        </TerminalPanel>

        <TerminalPanel eyebrow="Audit" title="Execution timeline" description="Most recent desk + agent events from the local audit log.">
          {timeline.length ? (
            <div className="divide-y divide-white/[0.06]">
              {timeline.map((e) => (
                <div key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                  <Clock3 aria-hidden className="mt-0.5 size-3 shrink-0 text-zinc-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="ad-eyebrow">{e.event}</span>
                      <span className="font-mono text-[9px] text-zinc-700">{formatUtcDateTime(e.timestamp)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">{e.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-4 text-xs text-zinc-500">No events recorded yet.</p>
          )}
        </TerminalPanel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <TerminalPanel eyebrow="Tokens" title="Token usage" description="Projected per-call token footprint.">
          <div className="p-4">
            <p className="font-mono text-2xl font-semibold tabular-nums text-zinc-50">
              {(costUsage.estimatedInputTokens + costUsage.estimatedOutputTokens).toLocaleString()}
            </p>
            <p className="text-[11px] text-zinc-500">in {costUsage.estimatedInputTokens.toLocaleString()} · out {costUsage.estimatedOutputTokens.toLocaleString()}</p>
            <Sparkline data={tokenHistory} tone="info" fill className="mt-3 h-10 w-full" />
          </div>
        </TerminalPanel>

        <TerminalPanel eyebrow="Spend" title="Cost tracking" description="Estimated spend vs daily budget.">
          <div className="p-4">
            <p className="font-mono text-2xl font-semibold tabular-nums text-zinc-50">{formatUsd(costUsage.estimatedCostUsd, 4)}</p>
            <p className="text-[11px] text-zinc-500">budget {formatUsd(costUsage.dailyBudgetUsd, 2)} · {budgetUsedPct.toFixed(1)}% used</p>
            <div className="mt-3"><HBar value={budgetUsedPct} max={100} tone={budgetUsedPct > 80 ? "danger" : budgetUsedPct > 50 ? "warning" : "positive"} /></div>
            <Sparkline data={costHistory} tone={budgetUsedPct > 80 ? "danger" : "positive"} fill className="mt-3 h-8 w-full" />
          </div>
        </TerminalPanel>

        <TerminalPanel eyebrow="Models" title="Model selection history" description="Active model and offline guarantee.">
          <div className="divide-y divide-white/[0.06]">
            {models.map((m) => (
              <div key={m.model} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-zinc-200">{m.model}</p>
                  <p className="text-[10px] text-zinc-600">{m.role}</p>
                </div>
                <StateBadge tone={m.state === "active" ? "positive" : "neutral"}>{m.state}</StateBadge>
              </div>
            ))}
          </div>
        </TerminalPanel>
      </div>

      <TerminalPanel eyebrow="Analytics" title="Agent performance analytics" description="Confidence by specialist plus forecast calibration.">
        <div className="grid gap-px overflow-hidden border-t border-white/[0.06] bg-white/[0.05] md:grid-cols-2">
          <div className="space-y-2.5 bg-[--ad-surface] p-4">
            <p className="ad-eyebrow">Confidence by agent</p>
            {(runs.length ? runs : [{ role: "n/a", title: "No run yet", confidence: 0 }]).map((r) => (
              <div key={r.role} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-[11px] text-zinc-400">{r.title}</span>
                <HBar value={r.confidence * 100} max={100} tone="info" />
                <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-400">{Math.round(r.confidence * 100)}%</span>
              </div>
            ))}
          </div>
          <div className="space-y-2.5 bg-[--ad-surface] p-4">
            <p className="ad-eyebrow">Forecast calibration</p>
            {forecastCalibration.map((c) => (
              <div key={c.label} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-zinc-400">{c.label}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-emerald-300">{c.accuracyPct}%</span>
                  <span className="font-mono text-[10px] text-zinc-600">Brier {c.brierScore.toFixed(2)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </TerminalPanel>
    </div>
  );
}

// ===========================================================================
// 3 · RISK CENTER
// ===========================================================================

export function RiskCenterWidgets() {
  const {
    openPositions,
    markedPositions,
    riskDecision,
    config,
    readinessHistory,
    launchReadiness,
  } = useDesk();
  const exposures = openPositions.map((p) => ({
    symbol: p.symbol,
    notional: Math.abs(p.quantity * p.markPrice),
    side: p.side,
  }));
  const totalExposure = exposures.reduce((s, e) => s + e.notional, 0);
  const maxExposure = exposures.reduce((m, e) => Math.max(m, e.notional), 0);
  const concentration = totalExposure ? (maxExposure / totalExposure) * 100 : 0;
  const maxLeverage = markedPositions.reduce((m, p) => Math.max(m, p.product === "derivatives" ? 2 : 1), 1);
  const drawdown = drawdownSeries(seedFrom("equity-dd"), 28, 100);
  const peak = Math.max(...drawdown);
  const trough = Math.min(...drawdown);
  const maxDdPct = ((trough - peak) / peak) * 100;
  const scoreHistory = readinessHistory.length
    ? readinessHistory.slice(0, 12).map((r) => r.score).reverse()
    : walk(seedFrom("riskscore"), 12, riskDecision.score, 0.05);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <TerminalPanel eyebrow="Exposure" title="Portfolio exposure by asset" description="Gross paper notional per open position.">
          {exposures.length ? (
            <div className="space-y-3 p-4">
              {exposures.map((e) => (
                <div key={e.symbol} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 font-mono text-[11px] text-zinc-200">{e.symbol}</span>
                  <StateBadge tone={e.side === "long" ? "positive" : "danger"}>{e.side}</StateBadge>
                  <div className="min-w-0 flex-1"><HBar value={e.notional} max={maxExposure} tone={e.side === "long" ? "positive" : "danger"} /></div>
                  <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-300">{formatUsd(e.notional, 0)}</span>
                </div>
              ))}
              <p className="border-t border-white/[0.06] pt-3 text-[11px] text-zinc-500">Total gross exposure {formatUsd(totalExposure, 0)} across {exposures.length} position{exposures.length === 1 ? "" : "s"}.</p>
            </div>
          ) : (
            <p className="p-4 text-xs text-zinc-500">No open exposure. Open a paper position to populate the exposure map.</p>
          )}
        </TerminalPanel>

        <TerminalPanel eyebrow="Drawdown" title="Drawdown monitor" description="Simulated equity drawdown shape for the session.">
          <div className="p-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-rose-300">{maxDdPct.toFixed(2)}%</p>
                <p className="text-[11px] text-zinc-500">max simulated drawdown</p>
              </div>
              <span className="font-mono text-[10px] text-zinc-600">peak {peak.toFixed(0)} · trough {trough.toFixed(0)}</span>
            </div>
            <Sparkline data={drawdown} tone="danger" fill className="mt-3 h-16 w-full" />
          </div>
        </TerminalPanel>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TerminalPanel eyebrow="Leverage" title="Leverage monitor">
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-zinc-50">{maxLeverage.toFixed(1)}×</p>
              <p className="text-[11px] text-zinc-500">peak · spot capped 1×</p>
            </div>
            <Gauge aria-hidden className="size-8 text-zinc-700" strokeWidth={1.2} />
          </div>
        </TerminalPanel>
        <TerminalPanel eyebrow="Concentration" title="Concentration risk">
          <div className="p-4">
            <p className="font-mono text-2xl font-semibold tabular-nums text-amber-300">{concentration.toFixed(0)}%</p>
            <p className="mb-3 text-[11px] text-zinc-500">largest single position</p>
            <HBar value={concentration} max={100} tone={concentration > 60 ? "danger" : concentration > 35 ? "warning" : "positive"} />
          </div>
        </TerminalPanel>
        <TerminalPanel eyebrow="Score history" title="Risk score history">
          <div className="p-4">
            <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-300">{riskDecision.score}</p>
            <p className="text-[11px] text-zinc-500">current · {launchReadiness.status}</p>
            <Sparkline data={scoreHistory} tone="positive" className="mt-2 h-9 w-full" />
          </div>
        </TerminalPanel>
        <TerminalPanel eyebrow="Kill switch" title="Emergency controls">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <StateBadge tone={config.emergencyStop ? "danger" : "positive"}>{config.emergencyStop ? "ACTIVE" : "Ready"}</StateBadge>
              <ShieldAlert aria-hidden className="size-5 text-zinc-600" />
            </div>
            <button
              className="mt-3 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2 text-[10px] font-semibold text-rose-300/70"
              disabled
              title="Emergency stop is controlled by server-side environment configuration."
              type="button"
            >
              Server-controlled stop
            </button>
            <p className="mt-2 text-[10px] leading-4 text-zinc-600">Status-only. The kill switch is enforced by backend configuration, never by the browser.</p>
          </div>
        </TerminalPanel>
      </div>
    </div>
  );
}

// ===========================================================================
// 4 · PAPER TRADING DESK
// ===========================================================================

export function PaperDeskWidgets() {
  const { openPositions, closedPositions, unrealizedPnl, realizedPnl, markedPositions, ideas } = useDesk();
  const baseline = 10000;
  const closedChrono = [...closedPositions].sort((a, b) => (a.closedAt ?? "").localeCompare(b.closedAt ?? ""));
  let cum = baseline;
  const equity = [baseline];
  for (const p of closedChrono) {
    cum += p.realizedPnlUsd ?? 0;
    equity.push(cum);
  }
  equity.push(baseline + realizedPnl + unrealizedPnl);
  while (equity.length < 8) equity.unshift(baseline);

  const wins = closedPositions.filter((p) => (p.realizedPnlUsd ?? 0) > 0).length;
  const losses = closedPositions.filter((p) => (p.realizedPnlUsd ?? 0) < 0).length;
  const winRate = wins + losses ? (wins / (wins + losses)) * 100 : 0;
  const best = markedPositions.reduce((m, p) => Math.max(m, p.realizedPnlUsd ?? p.unrealizedPnlUsd), 0);
  const worst = markedPositions.reduce((m, p) => Math.min(m, p.realizedPnlUsd ?? p.unrealizedPnlUsd), 0);

  // strategy attribution by symbol
  const bySymbol = new Map<string, number>();
  for (const p of markedPositions) {
    const pnl = p.closedAt ? p.realizedPnlUsd ?? 0 : p.unrealizedPnlUsd;
    bySymbol.set(p.symbol, (bySymbol.get(p.symbol) ?? 0) + pnl);
  }
  const attribution = [...bySymbol.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxAttr = attribution.reduce((m, [, v]) => Math.max(m, Math.abs(v)), 0.0001);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TerminalPanel eyebrow="Performance" title="Equity curve" description="Cumulative paper equity — baseline plus realised, marked to current.">
          <div className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="font-mono text-3xl font-semibold tabular-nums text-zinc-50">{formatUsd(equity[equity.length - 1], 2)}</p>
              <span className={`font-mono text-sm tabular-nums ${realizedPnl + unrealizedPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {realizedPnl + unrealizedPnl >= 0 ? "+" : ""}{formatUsd(realizedPnl + unrealizedPnl, 2)} session
              </span>
            </div>
            <Sparkline data={equity} tone={realizedPnl + unrealizedPnl >= 0 ? "positive" : "danger"} fill strokeWidth={1.75} className="mt-3 h-28 w-full" />
          </div>
        </TerminalPanel>

        <TerminalPanel eyebrow="Win rate" title="Win rate metrics">
          <div className="flex items-center justify-between gap-4 p-4">
            <RadialGauge value={winRate} label="win %" tone={winRate >= 50 ? "positive" : "warning"} size={104} />
            <div className="space-y-2 text-right">
              <div><p className="ad-eyebrow">Wins</p><p className="font-mono text-lg font-semibold text-emerald-300">{wins}</p></div>
              <div><p className="ad-eyebrow">Losses</p><p className="font-mono text-lg font-semibold text-rose-300">{losses}</p></div>
            </div>
          </div>
        </TerminalPanel>
      </div>

      <StatGridPanel>
        <Stat label="Open P&L" value={formatUsd(unrealizedPnl, 2)} tone={unrealizedPnl >= 0 ? "positive" : "danger"} />
        <Stat label="Realized P&L" value={formatUsd(realizedPnl, 2)} tone={realizedPnl >= 0 ? "positive" : "danger"} />
        <Stat label="Best trade" value={formatUsd(best, 2)} tone="positive" />
        <Stat label="Worst trade" value={formatUsd(worst, 2)} tone="danger" />
        <Stat label="Open positions" value={String(openPositions.length)} />
        <Stat label="Closed trades" value={String(closedPositions.length)} />
        <Stat label="Active ideas" value={String(ideas.length)} />
        <Stat label="Win rate" value={`${winRate.toFixed(0)}%`} tone={winRate >= 50 ? "positive" : "warning"} />
      </StatGridPanel>

      <div className="grid gap-3 lg:grid-cols-2">
        <TerminalPanel eyebrow="Attribution" title="Strategy attribution" description="P&L contribution by instrument (paper).">
          {attribution.length ? (
            <div className="space-y-3 p-4">
              {attribution.map(([sym, pnl]) => (
                <div key={sym} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 font-mono text-[11px] text-zinc-200">{sym}</span>
                  <div className="min-w-0 flex-1"><HBar value={Math.abs(pnl)} max={maxAttr} tone={pnl >= 0 ? "positive" : "danger"} /></div>
                  <span className={`w-20 shrink-0 text-right font-mono text-[11px] tabular-nums ${pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatUsd(pnl, 2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-4 text-xs text-zinc-500">No attribution yet — open or close paper trades to populate this.</p>
          )}
        </TerminalPanel>

        <TerminalPanel eyebrow="History" title="Trade history" description="Closed paper positions with realised P&L.">
          {closedPositions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-xs">
                <thead className="border-b border-white/[0.07] bg-white/[0.015] text-[10px] uppercase text-zinc-600">
                  <tr>
                    {["Pair", "Side", "Entry", "Exit/mark", "P&L"].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-semibold" scope="col">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.slice(0, 8).map((p) => (
                    <tr key={p.id} className="border-b border-white/[0.055] last:border-0">
                      <td className="px-4 py-2.5 font-mono font-semibold text-zinc-100">{p.symbol}</td>
                      <td className={`px-4 py-2.5 uppercase ${p.side === "long" ? "text-emerald-300" : "text-rose-300"}`}>{p.side}</td>
                      <td className="px-4 py-2.5 font-mono text-zinc-400">{formatUsd(p.entryPrice, 2)}</td>
                      <td className="px-4 py-2.5 font-mono text-zinc-400">{formatUsd(p.markPrice, 2)}</td>
                      <td className={`px-4 py-2.5 font-mono ${(p.realizedPnlUsd ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatUsd(p.realizedPnlUsd ?? 0, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-xs text-zinc-500">No closed trades yet. Close a paper position to start the trade history.</p>
          )}
        </TerminalPanel>
      </div>
    </div>
  );
}

function StatGridPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="ad-panel overflow-hidden">
      <header className="border-b border-white/[0.06] px-4 py-3">
        <p className="ad-eyebrow">Analytics</p>
        <h2 className="text-[13px] font-semibold tracking-tight text-zinc-100">P&L analytics</h2>
      </header>
      <div className="grid grid-cols-2 gap-px bg-white/[0.05] sm:grid-cols-4 xl:grid-cols-8">{children}</div>
    </section>
  );
}

// ===========================================================================
// 5 · SYSTEM HEALTH
// ===========================================================================

export function SystemHealthWidgets() {
  const { healthChecks, exchangeStatus, accountDiagnostics, config, costUsage, marketData } = useDesk();
  const openAiReady = config.openAiModel && healthChecks.find((c) => c.name === "OpenAI reasoning")?.status === "pass";

  const services = [
    { name: "MEXC Spot API", icon: Network, ok: exchangeStatus.credentialsReady, detail: exchangeStatus.credentialsReady ? "credentials ready" : "offline / paper" },
    { name: "Market data", icon: Radar, ok: marketData.status.source === "coingecko", detail: `${marketData.status.source} · ${marketData.status.freshness}` },
    { name: "AI reasoning", icon: BrainCircuit, ok: Boolean(openAiReady), detail: openAiReady ? config.openAiModel : "deterministic fallback" },
    { name: "Account diagnostics", icon: CircleGauge, ok: accountDiagnostics.status === "pass", detail: accountDiagnostics.status },
  ];

  const latency = [
    { name: "MEXC", ms: 60 + Math.round(seedFrom("lat-mexc") * 90) },
    { name: "CoinGecko", ms: 80 + Math.round(seedFrom("lat-cg") * 140) },
    { name: "OpenAI", ms: 220 + Math.round(seedFrom("lat-oai") * 380) },
    { name: "Audit sink", ms: 8 + Math.round(seedFrom("lat-audit") * 22) },
  ];
  const latSeries = walk(seedFrom("latseries"), 24, 120, 0.18);
  const queueDepth = Math.round(seedFrom("queue") * 4);
  const tokenConsumption = costUsage.estimatedInputTokens + costUsage.estimatedOutputTokens;
  const tokenHistory = walk(seedFrom("tok-consume"), 20, tokenConsumption, 0.14);

  return (
    <div className="space-y-3">
      <TerminalPanel eyebrow="Status" title="Service status monitoring" description="Operational posture across core dependencies.">
        <div className="grid grid-cols-2 gap-px overflow-hidden border-t border-white/[0.06] bg-white/[0.05] lg:grid-cols-4">
          {services.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.name} className="bg-[--ad-surface] p-4">
                <div className="flex items-center justify-between">
                  <Icon aria-hidden className="size-4 text-zinc-600" strokeWidth={1.6} />
                  <span className={`ad-dot ${s.ok ? "bg-emerald-400 text-emerald-400" : "bg-amber-400 text-amber-400"}`} />
                </div>
                <p className="mt-2.5 text-xs font-semibold text-zinc-200">{s.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-zinc-500">{s.detail}</p>
              </div>
            );
          })}
        </div>
      </TerminalPanel>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <TerminalPanel eyebrow="Latency" title="API latency monitoring" description="Simulated round-trip latency per dependency.">
          <div className="space-y-3 p-4">
            {latency.map((l) => (
              <div key={l.name} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[11px] text-zinc-400">{l.name}</span>
                <HBar value={l.ms} max={650} tone={l.ms > 400 ? "danger" : l.ms > 180 ? "warning" : "positive"} />
                <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-300">{l.ms} ms</span>
              </div>
            ))}
            <Sparkline data={latSeries} tone="info" fill className="mt-1 h-10 w-full" />
          </div>
        </TerminalPanel>

        <div className="grid gap-3 sm:grid-cols-2">
          <TerminalPanel eyebrow="Queue" title="Queue depth">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-mono text-3xl font-semibold tabular-nums text-zinc-50">{queueDepth}</p>
                <p className="text-[11px] text-zinc-500">pending jobs</p>
              </div>
              <Timer aria-hidden className="size-7 text-zinc-700" strokeWidth={1.3} />
            </div>
          </TerminalPanel>
          <TerminalPanel eyebrow="Models" title="Model availability">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-200">{config.openAiModel}</span>
                <StateBadge tone={openAiReady ? "positive" : "warning"}>{openAiReady ? "up" : "fallback"}</StateBadge>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-200">deterministic</span>
                <StateBadge tone="positive">up</StateBadge>
              </div>
            </div>
          </TerminalPanel>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <TerminalPanel eyebrow="Tokens" title="Token consumption">
          <div className="p-4">
            <p className="font-mono text-2xl font-semibold tabular-nums text-sky-300">{tokenConsumption.toLocaleString()}</p>
            <p className="text-[11px] text-zinc-500">projected per agent call · {formatUsd(costUsage.estimatedCostUsd, 4)}</p>
            <Sparkline data={tokenHistory} tone="info" fill className="mt-3 h-10 w-full" />
          </div>
        </TerminalPanel>
        <TerminalPanel eyebrow="Connectivity" title="Exchange connectivity" description="MEXC posture (read-only, sanitized).">
          <div className="grid grid-cols-2 gap-px overflow-hidden border-t border-white/[0.06] bg-white/[0.05] sm:grid-cols-3">
            <Stat label="Provider" value="MEXC" sub="spot v3" />
            <Stat label="Credentials" value={exchangeStatus.credentialsReady ? "Ready" : "Missing"} tone={exchangeStatus.credentialsReady ? "positive" : "warning"} />
            <Stat label="Mode" value={exchangeStatus.orderTestMode ? "Test-order" : "Mainnet"} tone={exchangeStatus.orderTestMode ? "info" : "danger"} />
            <Stat label="Live trading" value={config.liveTradingEnabled ? "ON" : "Locked"} tone={config.liveTradingEnabled ? "danger" : "positive"} />
            <Stat label="Account" value={accountDiagnostics.status} tone={accountDiagnostics.status === "pass" ? "positive" : "warning"} />
            <Stat label="Coverage" value={`${marketData.assets.length} assets`} sub="live feed" />
          </div>
        </TerminalPanel>
      </div>
    </div>
  );
}
