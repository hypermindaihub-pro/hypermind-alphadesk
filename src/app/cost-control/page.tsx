import { CommandCenterRoute } from "@/components/command-center-route";

export default async function CostControlPage() {
  return (
    <CommandCenterRoute
      activePath="/cost-control"
      initialView="cost-control"
      subtitle="Estimate agent spend, enforce daily budgets, and keep AI costs visible before calls run."
      title="Cost Control"
    />
  );
}
