import { describe, expect, it, vi } from "vitest";
import { getMexcAdapterStatus } from "../mexc-status";
import { getAlphaConfig } from "../config";
import {
  evaluateLiveExecutionGuards,
  MANUAL_CONFIRMATION_PHRASE,
} from "../execution-guards";
import { getMarketData, resetMarketCacheForTests } from "../coingecko";
import { estimateAgentCost } from "../cost-control";
import { appendJournalEntry, createJournalEntry } from "../journal";
import { classifyLiveOrderFailure } from "../live-order-diagnostics";
import {
  calculatePaperPnl,
  closePaperPosition,
  openPaperPosition,
} from "../paper-trading";
import { evaluateRisk } from "../risk-manager";
import { seedPortfolio, seedTradeIdeas } from "../sample-data";
import { buildSystemHealth } from "../system-health";

vi.mock("server-only", () => ({}));

describe("AlphaDesk trading safety defaults", () => {
  it("keeps live trading off and paper trading on by default", () => {
    const config = getAlphaConfig({});

    expect(config.liveTradingEnabled).toBe(false);
    expect(config.liveTestnetValidation).toBe(false);
    expect(config.paperTradingEnabled).toBe(true);
    expect(config.mexcOrderTestMode).toBe(true);
    expect(config.allowMainnetLiveTrading).toBe(false);
    expect(config.exchangeRequestTimeoutMs).toBe(8000);
    expect(getAlphaConfig({ MEXC_REQUEST_TIMEOUT_MS: "2500" }).exchangeRequestTimeoutMs).toBe(
      2500,
    );
  });

  it("redacts MEXC secrets while exposing safe readiness flags", () => {
    const status = getMexcAdapterStatus({
      MEXC_API_KEY: "super-secret-key",
      MEXC_API_SECRET: "super-secret-value",
      MEXC_ORDER_TEST_MODE: "true",
    });
    const serialized = JSON.stringify(status);

    expect(status.credentialsReady).toBe(true);
    expect(status.testnet).toBe(true);
    expect(serialized).not.toContain("super-secret-key");
    expect(serialized).not.toContain("super-secret-value");
  });

  it("rejects live execution when default guards are not satisfied", () => {
    const config = getAlphaConfig({});
    const trade = seedTradeIdeas[1];
    const riskDecision = evaluateRisk(trade, seedPortfolio, config);
    const decision = evaluateLiveExecutionGuards({
      trade,
      riskDecision,
      exchangeStatus: getMexcAdapterStatus({}),
      config,
      adminPermission: false,
      manualConfirmation: "",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("LIVE_TRADING_ENABLED is not true.");
    expect(decision.reasons).toContain("Admin permission did not pass.");
    expect(decision.reasons).toContain(
      "MEXC API credentials are not configured server-side.",
    );
  });

  it("approves a controlled paper trade and vetoes oversized risk", () => {
    const safeConfig = getAlphaConfig({ RISK_MAX_POSITION_USD: "5000" });
    const approved = evaluateRisk(seedTradeIdeas[1], seedPortfolio, safeConfig);
    const oversized = evaluateRisk(
      { ...seedTradeIdeas[1], quantity: 10 },
      seedPortfolio,
      safeConfig,
    );

    expect(approved.approved).toBe(true);
    expect(approved.approvedTradeFingerprint).toBeDefined();
    expect(oversized.approved).toBe(false);
    expect(oversized.vetoReasons.join(" ")).toContain("exceeds");
  });

  it("blocks execution when emergency stop is active", () => {
    const config = getAlphaConfig({
      LIVE_TRADING_ENABLED: "true",
      PRODUCT_SPOT_LIVE_ENABLED: "true",
      EMERGENCY_STOP: "true",
      RISK_MAX_POSITION_USD: "5000",
    });
    const trade = seedTradeIdeas[1];
    const riskDecision = evaluateRisk(trade, seedPortfolio, config);
    const decision = evaluateLiveExecutionGuards({
      trade,
      riskDecision,
      exchangeStatus: getMexcAdapterStatus({
        MEXC_API_KEY: "k",
        MEXC_API_SECRET: "s",
      }),
      config,
      adminPermission: true,
      manualConfirmation: MANUAL_CONFIRMATION_PHRASE,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("Emergency stop is active.");
  });

  it("requires product-specific live trading flags", () => {
    const config = getAlphaConfig({
      LIVE_TRADING_ENABLED: "true",
      PRODUCT_SPOT_LIVE_ENABLED: "false",
      RISK_MAX_POSITION_USD: "5000",
    });
    const trade = seedTradeIdeas[1];
    const riskDecision = evaluateRisk(trade, seedPortfolio, config);
    const decision = evaluateLiveExecutionGuards({
      trade,
      riskDecision,
      exchangeStatus: getMexcAdapterStatus({
        MEXC_API_KEY: "k",
        MEXC_API_SECRET: "s",
      }),
      config,
      adminPermission: true,
      manualConfirmation: MANUAL_CONFIRMATION_PHRASE,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("Live trading is disabled for spot.");
  });

  it("blocks MEXC mainnet live trading unless the explicit mainnet override is set", () => {
    const config = getAlphaConfig({
      LIVE_TRADING_ENABLED: "true",
      PRODUCT_SPOT_LIVE_ENABLED: "true",
      MEXC_ORDER_TEST_MODE: "false",
      RISK_MAX_POSITION_USD: "5000",
    });
    const trade = seedTradeIdeas[1];
    const riskDecision = evaluateRisk(trade, seedPortfolio, config);
    const decision = evaluateLiveExecutionGuards({
      trade,
      riskDecision,
      exchangeStatus: getMexcAdapterStatus({
        MEXC_API_KEY: "k",
        MEXC_API_SECRET: "s",
        MEXC_ORDER_TEST_MODE: "false",
      }),
      config,
      adminPermission: true,
      manualConfirmation: MANUAL_CONFIRMATION_PHRASE,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain(
      "MEXC mainnet live trading requires ALLOW_MAINNET_LIVE_TRADING=true.",
    );
  });

  it("treats MEXC error codes as rejected live submissions", async () => {
    const { submitGuardedMexcOrder } = await import("../mexc");
    const config = getAlphaConfig({
      LIVE_TRADING_ENABLED: "true",
      PRODUCT_SPOT_LIVE_ENABLED: "true",
      RISK_MAX_POSITION_USD: "5000",
    });
    const trade = seedTradeIdeas[1];
    const riskDecision = evaluateRisk(trade, seedPortfolio, config);
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          retCode: 10001,
          code: 30002,
          msg: "The minimum transaction volume cannot be less than:0.5USDT",
        }),
        { status: 400 },
      ),
    );

    const result = await submitGuardedMexcOrder({
      adminPermission: true,
      env: {
        MEXC_API_KEY: "k",
        MEXC_API_SECRET: "s",
        MEXC_ORDER_TEST_MODE: "true",
        LIVE_TRADING_ENABLED: "true",
        PRODUCT_SPOT_LIVE_ENABLED: "true",
        RISK_MAX_POSITION_USD: "5000",
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      manualConfirmation: MANUAL_CONFIRMATION_PHRASE,
      riskDecision,
      trade,
    });

    expect(result.submitted).toBe(false);
    expect(result.reasons).toContain(
      "MEXC rejected order: The minimum transaction volume cannot be less than:0.5USDT (30002).",
    );
    expect(JSON.stringify(result)).not.toContain("MEXC_API_SECRET");
  });

  it("classifies exchange restrictions as exchange eligibility blockers", () => {
    const diagnostic = classifyLiveOrderFailure([
      "MEXC rejected order: product access is restricted for this account.",
    ]);

    expect(diagnostic.category).toBe("exchange-eligibility");
    expect(diagnostic.label).toContain("eligibility");
    expect(JSON.stringify(diagnostic)).not.toContain("secret");
  });

  it("classifies socket access failures as exchange network blockers", () => {
    const diagnostic = classifyLiveOrderFailure([
      "MEXC order request failed: fetch failed / EACCES.",
    ]);

    expect(diagnostic.category).toBe("network");
    expect(diagnostic.operatorAction).toContain("MEXC diagnostic");
  });

  it("returns a guarded rejection when the MEXC order request cannot reach the exchange", async () => {
    const { submitGuardedMexcOrder } = await import("../mexc");
    const config = getAlphaConfig({
      LIVE_TRADING_ENABLED: "true",
      PRODUCT_SPOT_LIVE_ENABLED: "true",
      RISK_MAX_POSITION_USD: "5000",
    });
    const trade = seedTradeIdeas[1];
    const riskDecision = evaluateRisk(trade, seedPortfolio, config);

    const result = await submitGuardedMexcOrder({
      adminPermission: true,
      env: {
        MEXC_API_KEY: "k",
        MEXC_API_SECRET: "s",
        MEXC_ORDER_TEST_MODE: "true",
        LIVE_TRADING_ENABLED: "true",
        PRODUCT_SPOT_LIVE_ENABLED: "true",
        RISK_MAX_POSITION_USD: "5000",
      },
      fetchImpl: vi.fn(async () => {
        throw new Error("fetch failed / EACCES");
      }) as unknown as typeof fetch,
      manualConfirmation: MANUAL_CONFIRMATION_PHRASE,
      riskDecision,
      trade,
    });

    expect(result.submitted).toBe(false);
    expect(result.reasons.join(" ")).toContain("MEXC order request failed");
  });

  it("returns a guarded rejection when the MEXC order request times out", async () => {
    const { submitGuardedMexcOrder } = await import("../mexc");
    const config = getAlphaConfig({
      LIVE_TRADING_ENABLED: "true",
      PRODUCT_SPOT_LIVE_ENABLED: "true",
      RISK_MAX_POSITION_USD: "5000",
    });
    const trade = seedTradeIdeas[1];
    const riskDecision = evaluateRisk(trade, seedPortfolio, config);

    const result = await submitGuardedMexcOrder({
      adminPermission: true,
      env: {
        MEXC_API_KEY: "k",
        MEXC_API_SECRET: "s",
        MEXC_ORDER_TEST_MODE: "true",
        MEXC_REQUEST_TIMEOUT_MS: "1000",
        LIVE_TRADING_ENABLED: "true",
        PRODUCT_SPOT_LIVE_ENABLED: "true",
        RISK_MAX_POSITION_USD: "5000",
      },
      fetchImpl: vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(init.signal?.reason ?? new Error("aborted"));
            });
          }),
      ) as unknown as typeof fetch,
      manualConfirmation: MANUAL_CONFIRMATION_PHRASE,
      riskDecision,
      trade,
    });

    expect(result.submitted).toBe(false);
    expect(result.reasons.join(" ")).toContain("timed out");
    expect(JSON.stringify(result)).not.toContain("MEXC_API_SECRET");
  });

  it("calculates long and short paper-trading P&L", () => {
    expect(calculatePaperPnl("long", 2, 100, 110)).toBe(20);
    expect(calculatePaperPnl("short", 2, 100, 90)).toBe(20);

    const opened = openPaperPosition(seedTradeIdeas[2], "2026-05-31T00:00:00.000Z");
    const closed = closePaperPosition(opened, 142.8, "2026-05-31T01:00:00.000Z");

    expect(closed.realizedPnlUsd).toBeGreaterThan(0);
    expect(closed.closedAt).toBe("2026-05-31T01:00:00.000Z");
  });

  it("creates append-only journal entries", () => {
    const entry = createJournalEntry({
      id: "journal-test",
      timestamp: "2026-05-31T00:00:00.000Z",
      actor: "paper-trading",
      event: "paper-open",
      summary: "Opened a simulated ETH long.",
      metadata: { symbol: "ETHUSDT" },
    });
    const entries = appendJournalEntry([], entry);

    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toContain("simulated");
  });

  it("labels CoinGecko outage data as fallback", async () => {
    resetMarketCacheForTests();
    const failingFetch = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await getMarketData(failingFetch as unknown as typeof fetch, Date.now());

    expect(result.status.provider).toBe("CoinGecko");
    expect(result.status.freshness).toBe("fallback");
    expect(result.status.source).toBe("fallback");
    expect(result.assets.length).toBeGreaterThan(0);
  });

  it("blocks agent calls when projected costs exceed budget", () => {
    const config = getAlphaConfig({
      OPENAI_DAILY_BUDGET_USD: "0.01",
      OPENAI_HARD_STOP_USD: "0.02",
    });
    const usage = estimateAgentCost(10000, 10000, 0.015, config);

    expect(usage.allowed).toBe(false);
    expect(usage.message).toContain("blocks");
  });

  it("reports system health with safe defaults visible", () => {
    const config = getAlphaConfig({});
    const health = buildSystemHealth({
      config,
      exchangeStatus: getMexcAdapterStatus({}),
      mexcPublicConnectivity: {
        checkedAt: "2026-06-10T00:00:00.000Z",
        dns: {
          addresses: [],
          error: "EACCES api.mexc.com",
          ok: false,
        },
        endpoint: "https://api.mexc.com",
        hostname: "api.mexc.com",
        ok: false,
        publicServerTime: {
          error: "fetch failed",
          ok: false,
        },
        timeoutMs: 8000,
      },
      externalHttpsConnectivity: {
        checkedAt: "2026-06-10T00:00:00.000Z",
        globalNetworkEacces: true,
        lastSanitizedError: "EACCES",
        status: "blocked",
        targets: [
          {
            dns: {
              addressCount: 2,
              families: [4],
              ok: true,
            },
            hostname: "api.mexc.com",
            https: {
              error: "fetch failed / EACCES",
              ok: false,
            },
            name: "MEXC Spot API",
            tcp443: {
              error: "EACCES",
              ok: false,
              port: 443,
            },
          },
        ],
      },
      openAiConfigured: false,
      serverAuditStatus: {
        detail: "Server audit JSONL storage is disabled.",
        enabled: false,
        writable: false,
      },
    });
    const details = health.checks.map((check) => check.detail).join(" ");

    expect(health.status).toBe("fail");
    expect(details).toContain("Live trading is OFF by default.");
    expect(details).toContain("Paper trading is ON by default.");
    expect(details).toContain("External HTTPS: Blocked.");
    expect(details).toContain("MEXC Execution Certified: Blocked by network.");
    expect(details).toContain("Last sanitized network error: EACCES.");
    expect(details).toContain("Core MVP: Continue validation.");
    expect(details).toContain("Public MEXC preflight failed");
    expect(details).toContain("Server audit JSONL storage is disabled.");
  });

  it("does not fail health solely because live trading is enabled for isolated testnet validation", () => {
    const config = getAlphaConfig({
      ALPHADESK_ENABLE_LIVE_TESTNET_E2E: "true",
      MEXC_ORDER_TEST_MODE: "true",
      LIVE_TRADING_ENABLED: "true",
    });
    const health = buildSystemHealth({
      config,
      exchangeStatus: getMexcAdapterStatus({
        ALPHADESK_ENABLE_LIVE_TESTNET_E2E: "true",
        MEXC_ORDER_TEST_MODE: "true",
        LIVE_TRADING_ENABLED: "true",
      }),
      openAiConfigured: false,
      serverAuditStatus: {
        detail: "Server audit JSONL storage is disabled.",
        enabled: false,
        writable: false,
      },
    });
    const liveDefault = health.checks.find((check) => check.name === "Live trading default");

    expect(liveDefault?.status).toBe("pass");
    expect(liveDefault?.detail).toContain("isolated MEXC test-order validation");
  });
});
