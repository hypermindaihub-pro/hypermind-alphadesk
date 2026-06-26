import type { AlphaConfig } from "./config";
import { getAlphaConfig } from "./config";
import { getMexcAdapterStatus } from "./mexc-status";
import type { ExchangeAdapterStatus, HealthCheck } from "./types";

export type MexcAccountInfo = {
  accountModeLabel: string;
  canTrade?: boolean;
  canWithdraw?: boolean;
  canDeposit?: boolean;
  permissions?: string[];
  updatedAt?: string;
};

export type AccountDiagnostics = {
  checkedAt: string;
  status: "pass" | "warn" | "fail";
  source: "env" | "mexc";
  exchange: {
    credentialsReady: boolean;
    testnet: boolean;
  };
  accountInfo?: MexcAccountInfo;
  checks: HealthCheck[];
  beginnerExplanation: string;
};

type BuildAccountDiagnosticsInput = {
  accountInfo?: MexcAccountInfo;
  accountInfoError?: string;
  exchangeStatus?: ExchangeAdapterStatus;
  checkedAt?: string;
  config?: AlphaConfig;
};

export function labelUnifiedMarginStatus(value: number | undefined): string {
  switch (value) {
    case 1:
      return "classic account";
    case 3:
      return "UTA 1.0";
    case 4:
      return "UTA 1.0 Pro";
    case 5:
      return "UTA 2.0";
    case 6:
      return "UTA 2.0 Pro";
    default:
      return value === undefined ? "not checked" : `unknown (${value})`;
  }
}

export function buildAccountDiagnostics(
  input: BuildAccountDiagnosticsInput = {},
): AccountDiagnostics {
  const config = input.config ?? getAlphaConfig();
  const exchangeStatus = input.exchangeStatus ?? getMexcAdapterStatus();
  const accountInfo = input.accountInfo;
  const checks: HealthCheck[] = [
    {
      name: "Exchange mode",
      status: exchangeStatus.orderTestMode ? "pass" : config.liveTradingEnabled ? "fail" : "warn",
      detail: exchangeStatus.orderTestMode
        ? "MEXC is using test-order mode."
        : config.liveTradingEnabled
          ? "MEXC mainnet order mode is selected while live trading is enabled. Require a full manual launch review."
          : "MEXC mainnet order mode is selected, but live trading is still disabled.",
    },
    {
      name: "Credential posture",
      status: exchangeStatus.credentialsReady ? "pass" : "warn",
      detail: exchangeStatus.credentialsReady
        ? "MEXC credentials are present server-side for read-only diagnostics and guarded execution."
        : "MEXC credentials are missing; diagnostics stay in local readiness mode.",
    },
    {
      name: "Live guard posture",
      status: config.liveTradingEnabled && !exchangeStatus.orderTestMode ? "fail" : "pass",
      detail: config.liveTradingEnabled
        ? exchangeStatus.orderTestMode
          ? "Live trading is enabled for guarded MEXC test-order validation; every order still requires the full live guard chain."
          : "Live trading is enabled while MEXC is in real mainnet order mode."
        : "Live trading remains OFF by default.",
    },
  ];

  if (exchangeStatus.credentialsReady) {
    if (accountInfo) {
      checks.push(
        {
          name: "MEXC account type",
          status: accountInfo.accountModeLabel.startsWith("unknown") ? "warn" : "pass",
          detail: `MEXC account type is ${accountInfo.accountModeLabel}.`,
        },
        {
          name: "MEXC trade permission",
          status: accountInfo.canTrade === false ? "fail" : "pass",
          detail:
            accountInfo.canTrade === false
              ? "MEXC reports this key/account cannot trade."
              : "MEXC trading permission is enabled or was not explicitly denied.",
        },
        {
          name: "MEXC account permissions",
          status: (accountInfo.permissions ?? []).includes("SPOT") ? "pass" : "warn",
          detail: accountInfo.permissions?.length
            ? `MEXC permissions: ${accountInfo.permissions.join(", ")}.`
            : "MEXC did not return explicit permission labels.",
        },
        {
          name: "MEXC account transfers",
          status: accountInfo.canWithdraw === false || accountInfo.canDeposit === false ? "warn" : "pass",
          detail:
            accountInfo.canWithdraw === false || accountInfo.canDeposit === false
              ? "Deposit or withdrawal capability is limited; trading validation can continue but funding should be reviewed."
              : "Deposit and withdrawal capability is enabled or was not explicitly limited.",
        },
      );
    } else {
      checks.push({
        name: "MEXC account info",
        status: "fail",
        detail: input.accountInfoError
          ? `Account info polling failed: ${input.accountInfoError}. This blocks MEXC live validation.`
          : "Account info has not been fetched yet. This blocks MEXC live validation.",
      });
    }
  }

  const status = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";

  return {
    accountInfo,
    beginnerExplanation:
      "Account diagnostics explain whether the exchange account posture matches AlphaDesk's paper-first, live-off safety model.",
    exchange: {
      credentialsReady: exchangeStatus.credentialsReady,
      testnet: exchangeStatus.testnet,
    },
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    checks,
    source: accountInfo ? "mexc" : "env",
    status,
  };
}
