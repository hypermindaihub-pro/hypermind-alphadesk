import { CommandCenterRoute } from "@/components/command-center-route";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  return (
    <CommandCenterRoute
      activePath="/dashboard"
      initialView="dashboard"
      subtitle="Live market context, agent reasoning, Risk Manager status, paper portfolio, audit log, health checks, and cost controls in one operational view."
      title="Dashboard"
    />
  );
}
