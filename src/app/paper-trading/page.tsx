import { CommandCenterRoute } from "@/components/command-center-route";

export default async function PaperTradingPage() {
  return (
    <CommandCenterRoute
      activePath="/paper-trading"
      initialView="paper-trading"
      subtitle="Open and close simulated long/short positions locally without touching exchange execution."
      title="Paper Trading"
    />
  );
}
