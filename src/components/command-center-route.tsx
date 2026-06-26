import { AlphaShell } from "@/components/alpha-shell";
import { CommandCenter, type CommandView } from "@/components/command-center";
import {
  ACCESS_COOKIE_NAME,
  verifyAccessSession,
} from "@/lib/access-control";
import {
  buildAccountDiagnostics,
  type MexcAccountInfo,
} from "@/lib/account-diagnostics";
import { fetchMexcAccountInfo } from "@/lib/mexc";
import { getMexcAdapterStatus } from "@/lib/mexc-status";
import { getAlphaConfig } from "@/lib/config";
import { estimateAgentCost } from "@/lib/cost-control";
import { getMarketData } from "@/lib/coingecko";
import { summarizeError } from "@/lib/error-summary";
import { buildSystemHealth } from "@/lib/system-health";
import { checkMexcPublicConnectivity } from "@/lib/mexc-public-connectivity";
import { checkExternalHttpsConnectivity } from "@/lib/external-https-connectivity";
import { cookies } from "next/headers";

type CommandCenterRouteProps = {
  activePath: string;
  title: string;
  subtitle: string;
  initialView: CommandView;
};

export async function CommandCenterRoute({
  activePath,
  title,
  subtitle,
  initialView,
}: CommandCenterRouteProps) {
  const config = getAlphaConfig();
  const exchangeStatus = getMexcAdapterStatus();
  const cookieStore = await cookies();
  const accessSession = await verifyAccessSession(
    cookieStore.get(ACCESS_COOKIE_NAME)?.value,
    process.env.ALPHADESK_SESSION_SECRET ?? "",
  );
  const marketData = await getMarketData();
  const costUsage = estimateAgentCost(1800, 450, 0, config);
  const [mexcPublicConnectivity, externalHttpsConnectivity] =
    initialView === "system-health"
      ? await Promise.all([
          checkMexcPublicConnectivity(),
          checkExternalHttpsConnectivity(),
        ])
      : [undefined, undefined];
  let accountInfo: MexcAccountInfo | undefined;
  let accountInfoError: string | undefined;

  if (exchangeStatus.credentialsReady) {
    try {
      accountInfo = (await fetchMexcAccountInfo()) ?? undefined;
    } catch (error) {
      accountInfoError = summarizeError(error, "Unknown account-info failure.");
    }
  }

  const accountDiagnostics = buildAccountDiagnostics({
    accountInfo,
    accountInfoError,
    exchangeStatus,
    config,
  });
  const health = buildSystemHealth({
    accountDiagnostics,
    config,
    exchangeStatus,
    marketStatus: marketData.status,
    costUsage,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    mexcPublicConnectivity,
    externalHttpsConnectivity,
  });

  return (
    <AlphaShell activePath={activePath} subtitle={subtitle} title={title}>
      <CommandCenter
        exchangeStatus={exchangeStatus}
        accountDiagnostics={accountDiagnostics}
        config={config}
        costUsage={costUsage}
        healthChecks={health.checks}
        initialView={initialView}
        marketData={marketData}
        sessionRole={accessSession.valid ? accessSession.role : null}
      />
    </AlphaShell>
  );
}
