import { CommandCenterRoute } from "@/components/command-center-route";

export default async function ReportsPage() {
  return (
    <CommandCenterRoute
      activePath="/reports"
      initialView="reports"
      subtitle="Summaries generated from current paper positions, journal rows, and calibration evidence."
      title="Reports"
    />
  );
}
