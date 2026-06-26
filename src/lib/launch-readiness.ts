import type { AccountDiagnostics } from "./account-diagnostics";
import type { AlphaConfig } from "./config";
import { isProductLiveEnabled } from "./config";
import {
  evaluateLiveExecutionGuards,
  MANUAL_CONFIRMATION_PHRASE,
} from "./execution-guards";
import type { OrderReconciliationSummary } from "./order-reconciliation";
import type { PositionReconciliationSummary } from "./position-reconciliation";
import type { ExchangeAdapterStatus, HealthCheck, RiskDecision, TradeIntent } from "./types";
import type { WalletReconciliationSummary } from "./wallet-reconciliation";

export type LaunchReadinessStatus = "blocked" | "paper-ready" | "live-ready";

export type LaunchReadinessInput = {
  accountDiagnostics: AccountDiagnostics;
  adminPermission: boolean;
  exchangeStatus: ExchangeAdapterStatus;
  checkedAt?: string;
  config: AlphaConfig;
  manualConfirmation: string | boolean;
  orderReconciliation?: OrderReconciliationSummary | null;
  positionReconciliation?: PositionReconciliationSummary | null;
  riskDecision: RiskDecision;
  trade: TradeIntent;
  walletReconciliation?: WalletReconciliationSummary | null;
};

export type LaunchReadinessSnapshot = {
  status: LaunchReadinessStatus;
  checkedAt: string;
  score: number;
  checks: HealthCheck[];
  blockers: string[];
  warnings: string[];
  paperTradingEnabled: boolean;
  liveTradingEnabled: boolean;
  liveExecutionAllowed: boolean;
  requiredManualConfirmation: string;
  beginnerExplanation: string;
};

function statusFromCheckStatus(status: HealthCheck["status"]): number {
  if (status === "fail") {
    return 22;
  }

  if (status === "warn") {
    return 8;
  }

  return 0;
}

function reconciliationCheck(
  name: string,
  summary:
    | OrderReconciliationSummary
    | PositionReconciliationSummary
    | WalletReconciliationSummary
    | null
    | undefined,
): HealthCheck {
  if (!summary) {
    return {
      detail: `${name} reconciliation has not been run in this browser session.`,
      name,
      status: "warn",
    };
  }

  return {
    detail: `${name} reconciliation is ${summary.status} in ${summary.mode} mode.`,
    name,
    status: summary.status,
  };
}

export function buildLaunchReadinessSnapshot(
  input: LaunchReadinessInput,
): LaunchReadinessSnapshot {
  const liveDecision = evaluateLiveExecutionGuards({
    adminPermission: input.adminPermission,
    exchangeStatus: input.exchangeStatus,
    config: input.config,
    manualConfirmation: input.manualConfirmation,
    riskDecision: input.riskDecision,
    trade: input.trade,
  });
  const checks: HealthCheck[] = [
    {
      detail: input.config.paperTradingEnabled
        ? "Paper trading is enabled and remains the default operating mode."
        : "Paper trading is disabled; beginner-safe simulation is not available.",
      name: "Paper trading",
      status: input.config.paperTradingEnabled ? "pass" : "fail",
    },
    {
      detail: input.config.liveTradingEnabled
        ? "Global live trading is enabled, so every remaining guard must pass."
        : "Global live trading is OFF by default.",
      name: "Global live switch",
      status: input.config.liveTradingEnabled ? "pass" : "warn",
    },
    {
      detail: input.adminPermission
        ? "The signed session has admin permission."
        : "The signed session is not admin.",
      name: "Admin permission",
      status: input.adminPermission ? "pass" : "warn",
    },
    {
      detail: input.config.emergencyStop
        ? "Emergency stop is active."
        : "Emergency stop is clear.",
      name: "Emergency stop",
      status: input.config.emergencyStop ? "fail" : "pass",
    },
    {
      detail: input.config.noTradeMode
        ? "No-trade mode is active."
        : "No-trade mode is clear.",
      name: "No-trade mode",
      status: input.config.noTradeMode ? "fail" : "pass",
    },
    {
      detail: input.exchangeStatus.credentialsReady
        ? "MEXC credentials are present server-side; secret values are not exposed."
        : "MEXC credentials are missing server-side.",
      name: "MEXC credentials",
      status: input.exchangeStatus.credentialsReady ? "pass" : "warn",
    },
    {
      detail: input.exchangeStatus.testnet
        ? "MEXC adapter is using test-order mode."
        : "MEXC adapter is using real mainnet order mode.",
      name: "MEXC order mode",
      status: input.exchangeStatus.testnet ? "pass" : "warn",
    },
    {
      detail: isProductLiveEnabled(input.config, input.trade.product)
        ? `Live trading is enabled for ${input.trade.product}.`
        : `Live trading is disabled for ${input.trade.product}.`,
      name: "Product live flag",
      status: isProductLiveEnabled(input.config, input.trade.product) ? "pass" : "warn",
    },
    {
      detail: input.riskDecision.approved
        ? "Risk Manager approved the selected trade shape."
        : "Risk Manager vetoed the selected trade.",
      name: "Risk approval",
      status: input.riskDecision.approved ? "pass" : "fail",
    },
    {
      detail:
        input.manualConfirmation === true ||
        input.manualConfirmation === MANUAL_CONFIRMATION_PHRASE
          ? "Manual confirmation is present."
          : "Manual confirmation phrase has not been entered.",
      name: "Manual confirmation",
      status:
        input.manualConfirmation === true ||
        input.manualConfirmation === MANUAL_CONFIRMATION_PHRASE
          ? "pass"
          : "warn",
    },
    {
      detail: input.accountDiagnostics.beginnerExplanation,
      name: "Account diagnostics",
      status: input.accountDiagnostics.status,
    },
    reconciliationCheck("Order reconciliation", input.orderReconciliation),
    reconciliationCheck("Position reconciliation", input.positionReconciliation),
    reconciliationCheck("Wallet reconciliation", input.walletReconciliation),
  ];
  const blockers = [
    ...liveDecision.reasons,
    ...checks
      .filter((check) => check.status === "fail")
      .map((check) => `${check.name}: ${check.detail}`),
  ];
  const warnings = checks
    .filter((check) => check.status === "warn")
    .map((check) => `${check.name}: ${check.detail}`);
  const score = Math.max(
    0,
    Math.round(100 - checks.reduce((sum, check) => sum + statusFromCheckStatus(check.status), 0)),
  );
  const launchBlockers = checks.some((check) => check.status === "fail");
  const liveReady =
    liveDecision.allowed &&
    input.accountDiagnostics.status === "pass" &&
    input.orderReconciliation?.status === "pass" &&
    input.positionReconciliation?.status === "pass" &&
    input.walletReconciliation?.status === "pass";
  const paperReady =
    input.config.paperTradingEnabled &&
    !input.config.emergencyStop &&
    !input.config.noTradeMode &&
    input.accountDiagnostics.status !== "fail" &&
    input.orderReconciliation?.status !== "fail" &&
    input.positionReconciliation?.status !== "fail" &&
    input.walletReconciliation?.status !== "fail";
  const status: LaunchReadinessStatus = liveReady
    ? "live-ready"
    : paperReady && !launchBlockers
      ? "paper-ready"
      : paperReady
        ? "paper-ready"
        : "blocked";

  return {
    beginnerExplanation:
      status === "live-ready"
        ? "Every live guard, risk approval, account check, and reconciliation signal is green for this exact selected trade."
        : status === "paper-ready"
          ? "AlphaDesk is ready for paper operation. Live trading remains intentionally blocked until every live-specific guard passes."
          : "AlphaDesk should not launch a trade workflow until the failed checks are resolved.",
    blockers: Array.from(new Set(blockers)),
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    checks,
    liveExecutionAllowed: liveDecision.allowed,
    liveTradingEnabled: input.config.liveTradingEnabled,
    paperTradingEnabled: input.config.paperTradingEnabled,
    requiredManualConfirmation: MANUAL_CONFIRMATION_PHRASE,
    score,
    status,
    warnings: Array.from(new Set(warnings)),
  };
}
