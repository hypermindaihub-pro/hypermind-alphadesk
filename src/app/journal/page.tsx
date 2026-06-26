import { CommandCenterRoute } from "@/components/command-center-route";

export default async function JournalPage() {
  return (
    <CommandCenterRoute
      activePath="/journal"
      initialView="journal"
      subtitle="Append user notes, agent runs, risk probes, and paper-trading events into a reviewable audit trail."
      title="Journal"
    />
  );
}
