import { CommandCenterRoute } from "@/components/command-center-route";

export default async function AgentsPage() {
  return (
    <CommandCenterRoute
      activePath="/agents"
      initialView="agents"
      subtitle="Run AI reasoning with cost controls, fallback mode, and journaled outputs while execution stays isolated."
      title="Agents"
    />
  );
}
