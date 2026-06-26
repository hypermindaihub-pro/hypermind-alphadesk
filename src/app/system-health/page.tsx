import { CommandCenterRoute } from "@/components/command-center-route";

export default async function SystemHealthPage() {
  return (
    <CommandCenterRoute
      activePath="/system-health"
      initialView="system-health"
      subtitle="Operational checks for market data, OpenAI, MEXC, cost control, and trading safety defaults."
      title="System Health"
    />
  );
}
