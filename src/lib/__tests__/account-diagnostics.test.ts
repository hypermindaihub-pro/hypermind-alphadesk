import { describe, expect, it } from "vitest";
import {
  buildAccountDiagnostics,
  labelUnifiedMarginStatus,
} from "../account-diagnostics";
import { getMexcAdapterStatus } from "../mexc-status";
import { getAlphaConfig } from "../config";

describe("account diagnostics", () => {
  it("labels legacy account status values for compatibility", () => {
    expect(labelUnifiedMarginStatus(1)).toBe("classic account");
    expect(labelUnifiedMarginStatus(3)).toBe("UTA 1.0");
    expect(labelUnifiedMarginStatus(4)).toBe("UTA 1.0 Pro");
    expect(labelUnifiedMarginStatus(5)).toBe("UTA 2.0");
    expect(labelUnifiedMarginStatus(6)).toBe("UTA 2.0 Pro");
    expect(labelUnifiedMarginStatus(undefined)).toBe("not checked");
  });

  it("keeps missing credentials in local readiness mode", () => {
    const diagnostics = buildAccountDiagnostics({
      exchangeStatus: getMexcAdapterStatus({}),
      config: getAlphaConfig({}),
      checkedAt: "2026-06-04T00:00:00.000Z",
    });

    expect(diagnostics.source).toBe("env");
    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.checks.map((check) => check.name)).toContain(
      "Credential posture",
    );
  });

  it("fails loudly when mainnet and live trading are both enabled", () => {
    const diagnostics = buildAccountDiagnostics({
      exchangeStatus: getMexcAdapterStatus({
        MEXC_API_KEY: "key",
        MEXC_API_SECRET: "secret",
        MEXC_ORDER_TEST_MODE: "false",
        LIVE_TRADING_ENABLED: "true",
      }),
      config: getAlphaConfig({
        MEXC_ORDER_TEST_MODE: "false",
        LIVE_TRADING_ENABLED: "true",
      }),
      accountInfo: {
        accountModeLabel: "SPOT",
        canTrade: true,
        permissions: ["SPOT"],
      },
    });

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.checks.map((check) => check.detail).join(" ")).toContain(
      "mainnet",
    );
  });

  it("warns for complex account features that need review", () => {
    const diagnostics = buildAccountDiagnostics({
      exchangeStatus: getMexcAdapterStatus({
        MEXC_API_KEY: "key",
        MEXC_API_SECRET: "secret",
      }),
      config: getAlphaConfig({}),
      accountInfo: {
        accountModeLabel: "unknown account",
        canDeposit: true,
        canTrade: true,
        canWithdraw: false,
        permissions: ["MARGIN"],
      },
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.checks.filter((check) => check.status === "warn")).toHaveLength(
      3,
    );
  });

  it("passes guarded testnet diagnostics when live is intentionally enabled", () => {
    const diagnostics = buildAccountDiagnostics({
      exchangeStatus: getMexcAdapterStatus({
        MEXC_API_KEY: "key",
        MEXC_API_SECRET: "secret",
        MEXC_ORDER_TEST_MODE: "true",
        LIVE_TRADING_ENABLED: "true",
      }),
      config: getAlphaConfig({
        MEXC_ORDER_TEST_MODE: "true",
        LIVE_TRADING_ENABLED: "true",
      }),
      accountInfo: {
        accountModeLabel: "SPOT",
        canTrade: true,
        permissions: ["SPOT"],
      },
    });

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.checks.map((check) => check.detail).join(" ")).toContain(
      "guarded MEXC test-order validation",
    );
  });

  it("fails when MEXC account info polling fails despite configured credentials", () => {
    const diagnostics = buildAccountDiagnostics({
      accountInfoError: "fetch failed / EACCES api.mexc.com",
      exchangeStatus: getMexcAdapterStatus({
        MEXC_API_KEY: "key",
        MEXC_API_SECRET: "secret",
      }),
      config: getAlphaConfig({}),
    });

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.checks.map((check) => check.detail).join(" ")).toContain(
      "blocks MEXC live validation",
    );
  });
});
