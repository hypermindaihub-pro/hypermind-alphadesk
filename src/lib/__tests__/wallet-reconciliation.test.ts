import { describe, expect, it } from "vitest";
import {
  coinFromSpotSymbol,
  createSimulatedWalletBalances,
  paperPositionsToLocalSpotInventory,
  reconcileWalletBalances,
  type ExchangeWalletBalance,
} from "../wallet-reconciliation";
import { seedPaperPositions } from "../sample-data";

const localInventory = paperPositionsToLocalSpotInventory(seedPaperPositions);

describe("spot wallet reconciliation", () => {
  it("extracts base coins from stablecoin spot symbols", () => {
    expect(coinFromSpotSymbol("BTCUSDT")).toBe("BTC");
    expect(coinFromSpotSymbol("ETHUSDC")).toBe("ETH");
  });

  it("matches local spot inventory against simulated wallet balances", () => {
    const balances = createSimulatedWalletBalances(localInventory);
    const summary = reconcileWalletBalances(
      localInventory,
      balances,
      "simulated",
      "2026-06-03T00:00:00.000Z",
    );

    expect(summary.status).toBe("pass");
    expect(summary.matched).toBe(localInventory.length);
    expect(summary.missingWalletBalance).toBe(0);
  });

  it("fails when local spot inventory is missing from wallet balances", () => {
    const summary = reconcileWalletBalances(
      localInventory,
      [],
      "mexc",
      "2026-06-03T00:00:00.000Z",
    );

    expect(summary.status).toBe("fail");
    expect(summary.missingWalletBalance).toBe(localInventory.length);
    expect(summary.rows[0].beginnerExplanation).toContain("local spot inventory");
  });

  it("warns for wallet drift and orphan wallet coins", () => {
    const [local] = localInventory;
    const drift: ExchangeWalletBalance = {
      borrowed: 0,
      coin: local.coin,
      equity: local.quantity,
      exchange: "mexc",
      locked: 0,
      updatedAt: "2026-06-03T00:00:00.000Z",
      usdValue: local.estimatedUsdValue,
      walletBalance: local.quantity + 0.25,
    };
    const orphan: ExchangeWalletBalance = {
      borrowed: 0,
      coin: "ORPHAN",
      equity: 1,
      exchange: "mexc",
      locked: 0,
      updatedAt: "2026-06-03T00:00:00.000Z",
      usdValue: 100,
      walletBalance: 1,
    };
    const summary = reconcileWalletBalances(
      [local],
      [drift, orphan],
      "mexc",
      "2026-06-03T00:00:00.000Z",
    );

    expect(summary.status).toBe("warn");
    expect(summary.mismatched).toBe(1);
    expect(summary.orphanWalletBalance).toBe(1);
    expect(summary.rows.map((row) => row.status)).toEqual([
      "mismatch",
      "orphan-wallet-balance",
    ]);
  });
});
