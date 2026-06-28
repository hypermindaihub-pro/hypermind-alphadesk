import { formatCompactUsd, formatPct, formatUsd } from "@/lib/format";
import type { MarketDataResult } from "@/lib/types";
import { StatusChip } from "./status-chip";

export function MarketTable({ marketData }: { marketData: MarketDataResult }) {
  const tone =
    marketData.status.freshness === "fresh"
      ? "green"
      : marketData.status.freshness === "stale"
        ? "amber"
        : "red";

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-md border border-white/[0.08] bg-[#0d1115]">
      <div className="flex flex-col gap-3 border-b border-white/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-white">Live market scanner</h2>
          <p className="mt-1 text-xs text-zinc-500">{marketData.status.message}</p>
        </div>
        <StatusChip label={`${marketData.status.freshness} data`} tone={tone} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <caption className="ad-sr-only">
            Market scanner: {marketData.assets.length} monitored assets with{" "}
            {marketData.status.freshness} {marketData.status.provider} data.
          </caption>
          <thead className="bg-white/[0.015] text-[10px] uppercase text-zinc-600">
            <tr className="border-b border-white/[0.07]">
              <th className="px-4 py-2.5 font-semibold" scope="col">Asset</th>
              <th className="px-4 py-2.5 font-semibold" scope="col">Price</th>
              <th className="px-4 py-2.5 font-semibold" scope="col">24h</th>
              <th className="px-4 py-2.5 font-semibold" scope="col">Market cap</th>
              <th className="px-4 py-2.5 font-semibold" scope="col">Volume</th>
              <th className="px-4 py-2.5 font-semibold" scope="col">Signal</th>
              <th className="px-4 py-2.5 font-semibold" scope="col">Risk</th>
            </tr>
          </thead>
          <tbody>
            {marketData.assets.map((asset) => (
              <tr key={asset.id} className="border-b border-white/[0.055] transition hover:bg-white/[0.025] last:border-0">
                <td className="px-4 py-3">
                  <span className="font-semibold text-white">{asset.symbol}</span>
                  <span className="ml-2 text-[11px] text-zinc-600">{asset.name}</span>
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-zinc-200">
                  {formatUsd(asset.price, asset.price > 100 ? 0 : 2)}
                </td>
                <td
                  className={`px-4 py-3 font-mono tabular-nums ${
                    asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {formatPct(asset.change24h)}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-zinc-400">
                  {formatCompactUsd(asset.marketCap)}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-zinc-400">
                  {formatCompactUsd(asset.volume24h)}
                </td>
                <td className="px-4 py-3 uppercase text-zinc-300">{asset.signal}</td>
                <td className="px-4 py-3 uppercase text-zinc-400">{asset.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
