import { NextResponse } from "next/server";
import {
  buildAccountDiagnostics,
  type MexcAccountInfo,
} from "@/lib/account-diagnostics";
import { fetchMexcAccountInfo } from "@/lib/mexc";
import { getMexcAdapterStatus } from "@/lib/mexc-status";
import { getAlphaConfig } from "@/lib/config";
import { estimateAgentCost } from "@/lib/cost-control";
import { getMarketData } from "@/lib/coingecko";
import { buildSystemHealth } from "@/lib/system-health";
import { getServerAuditStatus } from "@/lib/server-audit-log";
import { summarizeError } from "@/lib/error-summary";
import { checkMexcPublicConnectivity } from "@/lib/mexc-public-connectivity";
import { checkExternalHttpsConnectivity } from "@/lib/external-https-connectivity";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getAlphaConfig();
  const marketData = await getMarketData();
  const costUsage = estimateAgentCost(1200, 300, 0, config);
  const exchangeStatus = getMexcAdapterStatus();
  const serverAuditStatus = await getServerAuditStatus();
  const [mexcPublicConnectivity, externalHttpsConnectivity] = await Promise.all([
    checkMexcPublicConnectivity(),
    checkExternalHttpsConnectivity(),
  ]);
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
    serverAuditStatus,
    mexcPublicConnectivity,
    externalHttpsConnectivity,
  });

  return NextResponse.json({
    accountDiagnostics,
    health,
    costUsage,
    marketStatus: marketData.status,
    serverAuditStatus,
    mexcPublicConnectivity,
    externalHttpsConnectivity,
  });
}
