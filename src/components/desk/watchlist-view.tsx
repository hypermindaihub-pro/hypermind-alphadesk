"use client";

import { Radar } from "lucide-react";
import { formatCompactUsd, formatPct, formatUsd } from "@/lib/format";
import type { MarketDataResult } from "@/lib/types";
import { MarketTable } from "../market-table";
import { StatusChip } from "../status-chip";
import { EmptyState } from "../trading-ui";
import { Panel } from "./primitives";
import { MarketIntelligenceWidgets } from "./widgets";

// Market Scanner view. Self-contained: it only needs the server-provided market
// snapshot. Demonstrates the per-view decomposition pattern for the rest of the
// command center.
export function WatchlistView({ marketData }: { marketData: MarketDataResult }) {
  const hasAssets = marketData.assets.length > 0;

  return (
    <div className="space-y-3">
      <MarketIntelligenceWidgets />

      <MarketTable marketData={marketData} />

      <Panel
        description="The watchlist uses CoinGecko prices and labels exactly when data is fresh, stale, or fallback."
        title="Market context"
      >
        {hasAssets ? (
          <div className="grid gap-3 md:grid-cols-4">
            {marketData.assets.map((asset) => (
              <div className="rounded-md border border-white/8 bg-black/20 p-4" key={asset.id}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-white">{asset.symbol}</h3>
                  <StatusChip
                    label={asset.signal}
                    tone={asset.signal === "accumulate" ? "green" : "neutral"}
                  />
                </div>
                <p className="mt-3 font-mono text-lg text-white">
                  {formatUsd(asset.price, asset.price > 100 ? 0 : 2)}
                </p>
                <p className={asset.change24h >= 0 ? "text-emerald-200" : "text-red-200"}>
                  {formatPct(asset.change24h)} 24h
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Cap {formatCompactUsd(asset.marketCap)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            description={
              marketData.status.message ||
              "No market assets are available right now. Paper workflows remain usable while the market feed recovers."
            }
            icon={Radar}
            title="Market data unavailable"
          />
        )}
      </Panel>
    </div>
  );
}
