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
    <section className="min-w-0 max-w-full rounded-lg border border-white/10 bg-[#111511]">
      <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">CoinGecko market data</h2>
          <p className="mt-1 text-sm text-zinc-400">{marketData.status.message}</p>
        </div>
        <StatusChip label={`${marketData.status.freshness} data`} tone={tone} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr className="border-b border-white/10">
              <th className="px-5 py-3 font-semibold">Asset</th>
              <th className="px-5 py-3 font-semibold">Price</th>
              <th className="px-5 py-3 font-semibold">24h</th>
              <th className="px-5 py-3 font-semibold">Market cap</th>
              <th className="px-5 py-3 font-semibold">Volume</th>
              <th className="px-5 py-3 font-semibold">Signal</th>
              <th className="px-5 py-3 font-semibold">Risk</th>
            </tr>
          </thead>
          <tbody>
            {marketData.assets.map((asset) => (
              <tr key={asset.id} className="border-b border-white/[0.06] last:border-0">
                <td className="px-5 py-4">
                  <span className="font-semibold text-white">{asset.symbol}</span>
                  <span className="ml-2 text-zinc-500">{asset.name}</span>
                </td>
                <td className="px-5 py-4 font-mono text-zinc-200">
                  {formatUsd(asset.price, asset.price > 100 ? 0 : 2)}
                </td>
                <td
                  className={`px-5 py-4 font-mono ${
                    asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {formatPct(asset.change24h)}
                </td>
                <td className="px-5 py-4 font-mono text-zinc-300">
                  {formatCompactUsd(asset.marketCap)}
                </td>
                <td className="px-5 py-4 font-mono text-zinc-300">
                  {formatCompactUsd(asset.volume24h)}
                </td>
                <td className="px-5 py-4 capitalize text-zinc-200">{asset.signal}</td>
                <td className="px-5 py-4 capitalize text-zinc-200">{asset.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
