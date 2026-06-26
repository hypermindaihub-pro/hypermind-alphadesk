import { CommandCenterRoute } from "@/components/command-center-route";

export default async function WatchlistPage() {
  return (
    <CommandCenterRoute
      activePath="/watchlist"
      initialView="watchlist"
      subtitle="CoinGecko-backed watchlist with freshness labels, signals, market caps, and selectable market context."
      title="Watchlist"
    />
  );
}
