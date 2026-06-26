import { describe, expect, it } from "vitest";
import {
  createSimulatedExchangeSnapshots,
  mergeOrderSnapshotsByKey,
  paperPositionsToLocalOrders,
  reconcileOrders,
  type ExchangeOrderSnapshot,
  type LocalOrderRecord,
} from "../order-reconciliation";
import { seedPaperPositions } from "../sample-data";

const localOrders = paperPositionsToLocalOrders(seedPaperPositions);

describe("order reconciliation", () => {
  it("matches local paper orders against simulated exchange snapshots", () => {
    const exchangeOrders = createSimulatedExchangeSnapshots(localOrders);
    const summary = reconcileOrders(
      localOrders,
      exchangeOrders,
      "simulated",
      "2026-06-03T00:00:00.000Z",
    );

    expect(summary.status).toBe("pass");
    expect(summary.matched).toBe(localOrders.length);
    expect(summary.missingOnExchange).toBe(0);
    expect(summary.rows.every((row) => row.status === "matched")).toBe(true);
  });

  it("fails when a local order is missing from the exchange snapshot", () => {
    const summary = reconcileOrders(
      localOrders,
      [],
      "mexc",
      "2026-06-03T00:00:00.000Z",
    );

    expect(summary.status).toBe("fail");
    expect(summary.missingOnExchange).toBe(localOrders.length);
    expect(summary.rows[0].beginnerExplanation).toContain("local order expectation");
  });

  it("warns for field mismatches and orphan exchange orders", () => {
    const [localOrder] = localOrders as [LocalOrderRecord, ...LocalOrderRecord[]];
    const mismatch: ExchangeOrderSnapshot = {
      clientOrderId: localOrder.clientOrderId,
      exchange: "mexc",
      filledQuantity: localOrder.quantity,
      id: "exchange-mismatch",
      product: localOrder.product,
      quantity: localOrder.quantity + 1,
      side: localOrder.side,
      status: "filled",
      symbol: localOrder.symbol,
      updatedAt: "2026-06-03T00:00:00.000Z",
    };
    const orphan: ExchangeOrderSnapshot = {
      exchange: "mexc",
      filledQuantity: 1,
      id: "orphan-order",
      product: "spot",
      quantity: 1,
      side: "long",
      status: "filled",
      symbol: "ORPHANUSDT",
      updatedAt: "2026-06-03T00:00:00.000Z",
    };
    const summary = reconcileOrders(
      [localOrder],
      [mismatch, orphan],
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

  it("merges realtime and historical snapshots by newest order key", () => {
    const realtime: ExchangeOrderSnapshot = {
      clientOrderId: "alpha-order-1",
      exchange: "mexc",
      filledQuantity: 0,
      id: "realtime-order",
      product: "spot",
      quantity: 1,
      side: "long",
      status: "open",
      symbol: "BTCUSDT",
      updatedAt: "2026-06-03T00:00:00.000Z",
    };
    const historical: ExchangeOrderSnapshot = {
      ...realtime,
      filledQuantity: 1,
      id: "history-order",
      status: "filled",
      updatedAt: "2026-06-03T00:01:00.000Z",
    };
    const merged = mergeOrderSnapshotsByKey([realtime], [historical]);

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("filled");
    expect(merged[0].id).toBe("history-order");
  });
});
