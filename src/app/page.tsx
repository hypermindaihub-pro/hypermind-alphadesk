import { CommandCenterRoute } from "@/components/command-center-route";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <CommandCenterRoute
      activePath="/"
      initialView="dashboard"
      subtitle="A private, paper-first AI crypto trading command center with real market data, risk vetoes, audit logs, and live trading locked down by default."
      title="Hypermind AlphaDesk"
    />
  );
}
