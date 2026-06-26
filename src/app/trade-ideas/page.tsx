import { CommandCenterRoute } from "@/components/command-center-route";

export default async function TradeIdeasPage() {
  return (
    <CommandCenterRoute
      activePath="/trade-ideas"
      initialView="trade-ideas"
      subtitle="Create, inspect, and select structured long/short hypotheses before they enter Risk Manager review."
      title="Trade Ideas"
    />
  );
}
