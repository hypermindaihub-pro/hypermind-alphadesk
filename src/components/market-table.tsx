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
    <section className="ad-panel min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="ad-eyebrow mb-1.5">Live feed</p>
          <h2 className="text-[13.5px] font-semibold tracking-tight text-zinc-50">Market scanner</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{marketData.status.message}</p>
        </div>
        <StatusChip label={`${marketData.status.freshness} data`} tone={tone} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <caption className="ad-sr-only">
            Market scanner: {marketData.assets.length} monitored assets with{" "}
            {marketData.status.freshness} {marketData.status.provider} data.
          </caption>
          <thead className="bg-white/[0.012] text-[10px] uppercase tracking-wide text-zinc-600">
            <tr className="border-b border-white/[0.06]">
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
              <tr key={asset.id} className="border-b border-white/[0.04] transition-colors duration-150 hover:bg-white/[0.018] last:border-0">
                <td className="px-4 py-3.5">
                  <span className="font-semibold text-zinc-50">{asset.symbol}</span>
                  <span className="ml-2 text-[11px] text-zinc-600">{asset.name}</span>
                </td>
                <td className="ad-num px-4 py-3.5 text-zinc-100">
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
