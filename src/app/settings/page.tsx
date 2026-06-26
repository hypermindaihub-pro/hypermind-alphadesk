import { CommandCenterRoute } from "@/components/command-center-route";

export default async function SettingsPage() {
  return (
    <CommandCenterRoute
      activePath="/settings"
      initialView="settings"
      subtitle="Server-authoritative runtime flags, secret readiness booleans, and safety posture."
      title="Settings"
    />
  );
}
