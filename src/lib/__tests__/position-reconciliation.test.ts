import { describe, expect, it } from "vitest";
import {
  createSimulatedPositionSnapshots,
  paperPositionsToLocalExposure,
  reconcilePositions,
  type ExchangePositionSnapshot,
} from "../position-reconciliation";
import { seedPaperPositions } from "../sample-data";

const localExposure = paperPositionsToLocalExposure(seedPaperPositions);

describe("position reconciliation", () => {
  it("matches local exposure against simulated exchange positions", () => {
    const exchangePositions = createSimulatedPositionSnapshots(localExposure);
    const summary = reconcilePositions(
      localExposure,
      exchangePositions,
      "simulated",
      "2026-06-03T00:00:00.000Z",
    );

    expect(summary.status).toBe("pass");
    expect(summary.matched).toBe(localExposure.length);
    expect(summary.rows.every((row) => row.status === "matched")).toBe(true);
  });

  it("fails when local exposure is missing from exchange positions", () => {
    const summary = reconcilePositions(
      localExposure,
      [],
      "mexc",
      "2026-06-03T00:00:00.000Z",
    );

    expect(summary.status).toBe("fail");
    expect(summary.missingOnExchange).toBe(localExposure.length);
    expect(summary.rows[0].beginnerExplanation).toContain("local exposure");
  });

  it("warns for exposure drift and orphan exchange positions", () => {
    const [local] = localExposure;
    const drift: ExchangePositionSnapshot = {
      averageEntryPrice: local.averageEntryPrice,
      exchange: "mexc",
      key: local.key,
      markPrice: local.markPrice,
      product: local.product,
      quantity: local.quantity + 0.5,
      side: local.side,
      symbol: local.symbol,
      unrealizedPnlUsd: local.unrealizedPnlUsd,
      updatedAt: "2026-06-03T00:00:00.000Z",
    };
    const orphan: ExchangePositionSnapshot = {
      averageEntryPrice: 100,
      exchange: "mexc",
      key: "derivatives:ORPHANUSDT:long",
      markPrice: 110,
      product: "derivatives",
      quantity: 1,
      side: "long",
      symbol: "ORPHANUSDT",
      unrealizedPnlUsd: 10,
      updatedAt: "2026-06-03T00:00:00.000Z",
    };
    const summary = reconcilePositions(
      [local],
      [drift, orphan],
      "mexc",
      "2026-06-03T00:00:00.000Z",
    );

    expect(summary.status).toBe("warn");
    expect(summary.mismatched).toBe(1);
    expect(summary.orphanOnExchange).toBe(1);
    expect(summary.rows.map((row) => row.status)).toEqual([
      "mismatch",
      "orphan-on-exchange",
    ]);
  });
});
