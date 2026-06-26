import type { AlphaConfig } from "./config";
import { getAlphaConfig } from "./config";
import { getMexcAdapterStatus } from "./mexc-status";
import type { ExchangeAdapterStatus, CostUsage, HealthCheck, MarketDataStatus } from "./types";
import type { AccountDiagnostics } from "./account-diagnostics";
import type { ServerAuditStatus } from "./server-audit-log";
import type { MexcPublicConnectivity } from "./mexc-public-connectivity";
import type { ExternalHttpsConnectivity } from "./external-https-connectivity";

export type SystemHealthSummary = {
  status: "pass" | "warn" | "fail";
  checks: HealthCheck[];
};

type BuildHealthInput = {
  accountDiagnostics?: AccountDiagnostics;
  config?: AlphaConfig;
  exchangeStatus?: ExchangeAdapterStatus;
  marketStatus?: MarketDataStatus;
  costUsage?: CostUsage;
  openAiConfigured?: boolean;
  serverAuditStatus?: ServerAuditStatus;
  mexcPublicConnectivity?: MexcPublicConnectivity;
  externalHttpsConnectivity?: ExternalHttpsConnectivity;
};

export function buildSystemHealth(input: BuildHealthInput = {}): SystemHealthSummary {
  const config = input.config ?? getAlphaConfig();
  const exchangeStatus = input.exchangeStatus ?? getMexcAdapterStatus();
  const globalNetworkEacces = input.externalHttpsConnectivity?.globalNetworkEacces === true;
  const lastSanitizedNetworkError =
    input.externalHttpsConnectivity?.lastSanitizedError ??
    input.mexcPublicConnectivity?.publicServerTime.error;
  const liveEnabledForTestnetValidation =
    config.liveTradingEnabled &&
    config.liveTestnetValidation &&
    exchangeStatus.orderTestMode &&
    !config.allowMainnetLiveTrading;
  const checks: HealthCheck[] = [
    {
      name: "AlphaDesk Core MVP status",
      status: globalNetworkEacces ? "warn" : "pass",
      detail: globalNetworkEacces
        ? "Core MVP: Continue validation. External exchange certification is blocked by GLOBAL_NETWORK_EACCES, but offline-safe platform workflows should continue."
        : "Core MVP: Ready for validation. No global outbound HTTPS blocker is currently detected.",
    },
    {
      name: "External HTTPS status",
      status:
        input.externalHttpsConnectivity?.status === "blocked"
          ? "fail"
          : input.externalHttpsConnectivity?.status === "warn"
            ? "warn"
            : "pass",
      detail:
        input.externalHttpsConnectivity?.status === "blocked"
          ? `External HTTPS: Blocked. GLOBAL_NETWORK_EACCES prevents outbound TCP 443/HTTPS for multiple targets.`
          : input.externalHttpsConnectivity
            ? "External HTTPS checks are not globally blocked."
            : "External HTTPS checks have not been run in this view.",
    },
    {
      name: "MEXC diagnostics status",
      status: input.mexcPublicConnectivity?.ok ? "pass" : input.mexcPublicConnectivity ? "fail" : "warn",
      detail: input.mexcPublicConnectivity?.ok
        ? "MEXC diagnostics: public DNS and server-time checks passed."
        : input.mexcPublicConnectivity
          ? `MEXC diagnostics: blocked before exchange validation. ${input.mexcPublicConnectivity.publicServerTime.error ?? input.mexcPublicConnectivity.dns.error ?? "Unknown sanitized network error."}`
          : "MEXC diagnostics have not been run in this view.",
    },
    {
      name: "MEXC Execution Certification status",
      status: input.mexcPublicConnectivity?.ok ? "warn" : "fail",
      detail: input.mexcPublicConnectivity?.ok
        ? "MEXC Execution Certified: pending guarded order-test validation through the live execution chain."
        : globalNetworkEacces
          ? "MEXC Execution Certified: Blocked by network. GLOBAL_NETWORK_EACCES prevents exchange diagnostics and order-test validation."
          : "MEXC Execution Certified: blocked until MEXC diagnostics and guarded order-test validation pass.",
    },
    {
      name: "Paper trading status",
      status: config.paperTradingEnabled ? "pass" : "fail",
      detail: config.paperTradingEnabled
        ? "Paper Trading: Ready. Simulated trading remains available offline."
        : "Paper Trading: Not ready because PAPER_TRADING_ENABLED is false.",
    },
    {
      name: "Live trading status",
      status: config.liveTradingEnabled && !liveEnabledForTestnetValidation ? "fail" : "pass",
      detail: config.liveTradingEnabled
        ? liveEnabledForTestnetValidation
          ? "Live Trading: ON only for isolated MEXC order-test validation."
          : "Live Trading: ON outside the isolated validation posture."
        : "Live Trading: OFF.",
    },
    {
      name: "Emergency stop status",
      status: config.emergencyStop ? "fail" : "pass",
      detail: config.emergencyStop
        ? "Emergency Stop: Active. Execution is blocked."
        : "Emergency Stop: Clear.",
    },
    {
      name: "Cost-control status",
      status: input.costUsage?.allowed === false ? "fail" : "pass",
      detail: input.costUsage?.allowed === false
        ? input.costUsage.message
        : "Cost-control status: ready.",
    },
    {
      name: "Last sanitized network error",
      status: lastSanitizedNetworkError ? "warn" : "pass",
      detail: lastSanitizedNetworkError
        ? `Last sanitized network error: ${lastSanitizedNetworkError}.`
        : "Last sanitized network error: none recorded.",
    },
    {
      name: "Live trading default",
      status:
        config.liveTradingEnabled && !liveEnabledForTestnetValidation ? "fail" : "pass",
      detail: config.liveTradingEnabled
        ? liveEnabledForTestnetValidation
          ? "Live trading is intentionally enabled for isolated MEXC test-order validation."
          : "Live trading is enabled outside the isolated testnet validation gate. Confirm every live guard before use."
        : "Live trading is OFF by default.",
    },
    {
      name: "Paper trading default",
      status: config.paperTradingEnabled ? "pass" : "warn",
      detail: config.paperTradingEnabled
        ? "Paper trading is ON by default."
        : "Paper trading is disabled.",
    },
    {
      name: "MEXC adapter",
      status: exchangeStatus.credentialsReady ? "pass" : "warn",
      detail: exchangeStatus.credentialsReady
        ? `MEXC ${exchangeStatus.orderTestMode ? "test-order mode" : "mainnet"} credentials detected server-side.`
        : `MEXC ${exchangeStatus.orderTestMode ? "test-order mode" : "mainnet"} adapter is guarded and waiting for server-side credentials.`,
    },
    {
      name: "Market data",
      status:
        input.marketStatus?.freshness === "fresh"
          ? "pass"
          : input.marketStatus?.freshness === "stale"
            ? "warn"
            : "warn",
      detail: input.marketStatus?.message ?? "Market data will be checked when the dashboard loads.",
    },
    {
      name: "OpenAI reasoning",
      status: input.openAiConfigured ? "pass" : "warn",
      detail: input.openAiConfigured
        ? "OpenAI API key is configured server-side."
        : "OpenAI calls will use deterministic fallback until OPENAI_API_KEY is set.",
    },
    {
      name: "Cost control",
      status: input.costUsage?.allowed === false ? "fail" : "pass",
      detail: input.costUsage?.message ?? "Cost control budget is configured.",
    },
    {
      name: "Server audit storage",
      status:
        input.serverAuditStatus?.enabled === true
          ? input.serverAuditStatus.writable
            ? "pass"
            : "fail"
          : "warn",
      detail:
        input.serverAuditStatus?.detail ??
        "Server audit JSONL storage has not been checked.",
    },
  ];

  if (input.mexcPublicConnectivity) {
    const preflight = input.mexcPublicConnectivity;

    checks.push({
      name: "MEXC public connectivity",
      status: preflight.ok ? "pass" : "fail",
      detail: preflight.ok
        ? `Public MEXC DNS and server-time checks passed for ${preflight.hostname}.`
        : `Public MEXC preflight failed for ${preflight.hostname}: DNS ${
            preflight.dns.ok ? "pass" : preflight.dns.error ?? "failed"
          }; server time ${
            preflight.publicServerTime.ok
              ? "pass"
              : preflight.publicServerTime.error ?? "failed"
          }.`,
    });
  }

  if (input.accountDiagnostics) {
    checks.push({
      name: "Account diagnostics",
      status: input.accountDiagnostics.status,
      detail: input.accountDiagnostics.accountInfo
        ? `Account diagnostics fetched ${input.accountDiagnostics.accountInfo.accountModeLabel} with ${input.accountDiagnostics.accountInfo.permissions?.join(", ") || "unknown permissions"}.`
        : input.accountDiagnostics.beginnerExplanation,
    });
  }

  const status = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";

  return { status, checks };
}
