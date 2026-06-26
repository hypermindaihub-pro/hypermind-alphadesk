import { CommandCenterRoute } from "@/components/command-center-route";

export default async function RiskPage() {
  return (
    <CommandCenterRoute
      activePath="/risk"
      initialView="risk"
      subtitle="Exact-trade approval, veto reasons, and live execution guard checks in one hard safety console."
      title="Risk Manager"
    />
  );
}
