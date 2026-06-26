import { describe, expect, it } from "vitest";
import {
  buildAccountDiagnostics,
  type AccountDiagnostics,
} from "../account-diagnostics";
import { getMexcAdapterStatus } from "../mexc-status";
import { getAlphaConfig } from "../config";
import { buildLaunchReadinessSnapshot } from "../launch-readiness";
import type { OrderReconciliationSummary } from "../order-reconciliation";
import type { PositionReconciliationSummary } from "../position-reconciliation";
import { evaluateRisk } from "../risk-manager";
import { seedPortfolio, seedTradeIdeas } from "../sample-data";
import type { ExchangeAdapterStatus } from "../types";
import type { WalletReconciliationSummary } from "../wallet-reconciliation";

const checkedAt = "2026-06-04T00:00:00.000Z";

function passAccountDiagnostics(
  exchangeStatus: ExchangeAdapterStatus,
): AccountDiagnostics {
  return {
    beginnerExplanation: "Account diagnostics passed for this synthetic readiness test.",
    exchange: {
      credentialsReady: exchangeStatus.credentialsReady,
      testnet: exchangeStatus.testnet,
    },
    checkedAt,
    checks: [
      {
        detail: "Account posture is clean.",
        name: "Synthetic account posture",
        status: "pass",
      },
    ],
    source: "mexc",
    status: "pass",
  };
}

function passOrderReconciliation(): OrderReconciliationSummary {
  return {
    checkedAt,
    matched: 1,
    mismatched: 0,
    missingOnExchange: 0,
    mode: "simulated",
    orphanOnExchange: 0,
    rows: [],
    status: "pass",
    totalExchange: 1,
    totalLocal: 1,
  };
}

function passPositionReconciliation(): PositionReconciliationSummary {
  return {
    checkedAt,
    matched: 1,
    mismatched: 0,
    missingOnExchange: 0,
    mode: "simulated",
    orphanOnExchange: 0,
    rows: [],
    status: "pass",
    totalExchange: 1,
    totalLocal: 1,
  };
}

function passWalletReconciliation(): WalletReconciliationSummary {
  return {
    checkedAt,
    matched: 1,
    mismatched: 0,
    missingWalletBalance: 0,
    mode: "simulated",
    orphanWalletBalance: 0,
    rows: [],
    status: "pass",
    totalLocal: 1,
    totalWallet: 1,
  };
}

describe("launch readiness snapshots", () => {
  it("marks defaults as paper-ready with live trading intentionally blocked", () => {
    const config = getAlphaConfig({});
    const exchangeStatus = getMexcAdapterStatus({});
    const trade = seedTradeIdeas[1];
    const snapshot = buildLaunchReadinessSnapshot({
      accountDiagnostics: buildAccountDiagnostics({ exchangeStatus, checkedAt, config }),
      adminPermission: false,
      exchangeStatus,
      checkedAt,
      config,
      manualConfirmation: "",
      riskDecision: evaluateRisk(trade, seedPortfolio, config),
      trade,
    });

    expect(snapshot.status).toBe("paper-ready");
    expect(snapshot.paperTradingEnabled).toBe(true);
    expect(snapshot.liveTradingEnabled).toBe(false);
    expect(snapshot.blockers).toContain("LIVE_TRADING_ENABLED is not true.");
  });

  it("marks a fully guarded exact trade as live-ready", () => {
    const config = getAlphaConfig({
      LIVE_TRADING_ENABLED: "true",
      PRODUCT_SPOT_LIVE_ENABLED: "true",
      RISK_MAX_POSITION_USD: "5000",
    });
    const exchangeStatus = getMexcAdapterStatus({
      MEXC_API_KEY: "key",
      MEXC_API_SECRET: "secret",
      MEXC_ORDER_TEST_MODE: "true",
    });
    const trade = seedTradeIdeas[1];
    const snapshot = buildLaunchReadinessSnapshot({
      accountDiagnostics: passAccountDiagnostics(exchangeStatus),
      adminPermission: true,
      exchangeStatus,
      checkedAt,
      config,
      manualConfirmation: "CONFIRM LIVE TRADE",
      orderReconciliation: passOrderReconciliation(),
      positionReconciliation: passPositionReconciliation(),
      riskDecision: evaluateRisk(trade, seedPortfolio, config),
      trade,
      walletReconciliation: passWalletReconciliation(),
    });

    expect(snapshot.status).toBe("live-ready");
    expect(snapshot.liveExecutionAllowed).toBe(true);
    expect(snapshot.blockers).toHaveLength(0);
  });

  it("blocks launch when emergency stop is active", () => {
    const config = getAlphaConfig({ EMERGENCY_STOP: "true" });
    const exchangeStatus = getMexcAdapterStatus({});
    const trade = seedTradeIdeas[1];
    const snapshot = buildLaunchReadinessSnapshot({
      accountDiagnostics: buildAccountDiagnostics({ exchangeStatus, checkedAt, config }),
      adminPermission: false,
      exchangeStatus,
      checkedAt,
      config,
      manualConfirmation: "",
      riskDecision: evaluateRisk(trade, seedPortfolio, config),
      trade,
    });

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.blockers.join(" ")).toContain("Emergency stop is active.");
  });

  it("blocks launch when account diagnostics fail", () => {
    const config = getAlphaConfig({});
    const exchangeStatus = getMexcAdapterStatus({});
    const trade = seedTradeIdeas[1];
    const snapshot = buildLaunchReadinessSnapshot({
      accountDiagnostics: {
        ...buildAccountDiagnostics({ exchangeStatus, checkedAt, config }),
        status: "fail",
      },
      adminPermission: false,
      exchangeStatus,
      checkedAt,
      config,
      manualConfirmation: "",
      riskDecision: evaluateRisk(trade, seedPortfolio, config),
      trade,
    });

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.blockers.join(" ")).toContain("Account diagnostics");
  });
});
