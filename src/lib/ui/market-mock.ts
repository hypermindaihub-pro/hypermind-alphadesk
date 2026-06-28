// UI-only, deterministic display generators for the institutional widgets.
//
// These produce *simulated* series for instrumentation that has no backend feed
// yet (latency, token history, correlation, drawdown shape, etc.). Everything is
// a pure function of a string/number seed so server and client render identically
// (no hydration mismatch) and nothing is random. Views must label this output as
// simulated/sample — it must never be presented as live exchange data.

export function seedFrom(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 2 ** 32;
}

// Deterministic bounded random walk from a seed.
export function walk(seed: number, n: number, base = 100, vol = 0.06): number[] {
  const out: number[] = [];
  let v = base;
  let x = Math.floor(seed * 233280) || 1;
  for (let i = 0; i < n; i += 1) {
    x = (x * 9301 + 49297) % 233280;
    const r = x / 233280;
    v = Math.max(0.01, v * (1 + (r - 0.5) * vol));
    out.push(v);
  }
  return out;
}

// A drawdown-shaped curve (rises then a controlled pullback) for risk panels.
export function drawdownSeries(seed: number, n = 24, peak = 100): number[] {
  const w = walk(seed, n, peak, 0.05);
  return w.map((v, i) => {
    const dip = Math.sin((i / n) * Math.PI) * 0.06 * peak;
    return v - dip;
  });
}

// Simulated correlation in [-1, 1] for an ordered pair of symbols.
export function pairCorrelation(a: string, b: string): number {
  if (a === b) return 1;
  const s = seedFrom(a < b ? `${a}|${b}` : `${b}|${a}`);
  return Math.round((s * 1.8 - 0.7) * 100) / 100; // skew toward positive
}

// 0–100 simulated sentiment from real 24h change plus a deterministic offset.
export function sentimentScore(symbol: string, change24h: number): number {
  const bias = (seedFrom(symbol) - 0.5) * 18;
  return Math.max(2, Math.min(98, Math.round(50 + change24h * 6 + bias)));
}

// Annualised-ish volatility proxy from 24h move magnitude + a stable offset.
export function volatilityPct(symbol: string, change24h: number): number {
  const base = 18 + seedFrom(`${symbol}v`) * 40;
  return Math.round((base + Math.abs(change24h) * 4) * 10) / 10;
}

export type Sparseries = number[];
