import { describe, expect, it } from "vitest";
import { buildAccountDiagnostics } from "../account-diagnostics";
import { getMexcAdapterStatus } from "../mexc-status";
import { getAlphaConfig } from "../config";
import {
  createAccountDiagnosticsHistoryEntry,
  createLaunchReadinessHistoryEntry,
  prependCapped,
} from "../desk-history";
import { buildLaunchReadinessSnapshot } from "../launch-readiness";
import { evaluateRisk } from "../risk-manager";
import { seedPortfolio, seedTradeIdeas } from "../sample-data";

describe("desk history", () => {
  it("summarizes launch readiness and diagnostics without secrets", () => {
    const config = getAlphaConfig({});
    const exchangeStatus = getMexcAdapterStatus({
      MEXC_API_KEY: "secret-key",
      MEXC_API_SECRET: "secret-value",
    });
    const diagnostics = buildAccountDiagnostics({
      accountInfo: {
        accountModeLabel: "SPOT",
        canTrade: true,
        permissions: ["SPOT"],
      },
      exchangeStatus,
      config,
    });
    const readiness = buildLaunchReadinessSnapshot({
      accountDiagnostics: diagnostics,
      adminPermission: false,
      exchangeStatus,
      checkedAt: "2026-06-04T00:00:00.000Z",
      config,
      manualConfirmation: "",
      riskDecision: evaluateRisk(seedTradeIdeas[1], seedPortfolio, config),
      trade: seedTradeIdeas[1],
    });
    const readinessEntry = createLaunchReadinessHistoryEntry(
      readiness,
      "2026-06-04T00:00:00.000Z",
    );
    const diagnosticsEntry = createAccountDiagnosticsHistoryEntry(
      diagnostics,
      "2026-06-04T00:00:00.000Z",
    );
    const serialized = JSON.stringify([readinessEntry, diagnosticsEntry]);

    expect(readinessEntry.status).toBe("paper-ready");
    expect(readinessEntry.liveTradingEnabled).toBe(false);
    expect(diagnosticsEntry.credentialsReady).toBe(true);
    expect(serialized).not.toContain("secret-key");
    expect(serialized).not.toContain("secret-value");
  });

  it("prepends and caps history entries", () => {
    const entries = prependCapped([1, 2, 3], 0, 3);

    expect(entries).toEqual([0, 1, 2]);
  });
});
