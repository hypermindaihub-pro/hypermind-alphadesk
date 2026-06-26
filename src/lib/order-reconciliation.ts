import type { PaperPosition, TradeProduct, TradeSide } from "./types";

export type LocalOrderStatus = "expected-filled" | "expected-open" | "expected-cancelled";
export type ExchangeOrderStatus =
  | "open"
  | "partially-filled"
  | "filled"
  | "cancelled"
  | "rejected";
export type ReconciliationMode = "simulated" | "mexc";
export type ReconciliationSeverity = "pass" | "warn" | "fail";

export type LocalOrderRecord = {
  id: string;
  clientOrderId: string;
  source: "paper" | "live";
  symbol: string;
  side: TradeSide;
  product: TradeProduct;
  quantity: number;
  expectedStatus: LocalOrderStatus;
  updatedAt: string;
};

export type ExchangeOrderSnapshot = {
  id: string;
  clientOrderId?: string;
  exchange: "mexc" | "simulated";
  symbol: string;
  side: TradeSide;
  product: TradeProduct;
  quantity: number;
  filledQuantity: number;
  status: ExchangeOrderStatus;
  updatedAt: string;
};

export type OrderReconciliationRow = {
  key: string;
  severity: ReconciliationSeverity;
  status: "matched" | "missing-on-exchange" | "mismatch" | "orphan-on-exchange";
  localOrder?: LocalOrderRecord;
  exchangeOrder?: ExchangeOrderSnapshot;
  issues: string[];
  beginnerExplanation: string;
};

export type OrderReconciliationSummary = {
  checkedAt: string;
  mode: ReconciliationMode;
  status: ReconciliationSeverity;
  matched: number;
  mismatched: number;
  missingOnExchange: number;
  orphanOnExchange: number;
  totalLocal: number;
  totalExchange: number;
  rows: OrderReconciliationRow[];
};

const QUANTITY_TOLERANCE = 0.00000001;

function localKey(order: LocalOrderRecord): string {
  return order.clientOrderId || order.id;
}

function exchangeKey(order: ExchangeOrderSnapshot): string {
  return order.clientOrderId || order.id;
}

export function mergeOrderSnapshotsByKey(
  ...groups: ExchangeOrderSnapshot[][]
): ExchangeOrderSnapshot[] {
  const byKey = new Map<string, ExchangeOrderSnapshot>();

  for (const order of groups.flat()) {
    const key = exchangeKey(order);
    const existing = byKey.get(key);

    if (!existing || order.updatedAt > existing.updatedAt) {
      byKey.set(key, order);
    }
  }

  return Array.from(byKey.values());
}

function expectedMatchesExchange(
  expectedStatus: LocalOrderStatus,
  exchangeStatus: ExchangeOrderStatus,
): boolean {
  if (expectedStatus === "expected-filled") {
    return exchangeStatus === "filled";
  }

  if (expectedStatus === "expected-open") {
    return exchangeStatus === "open" || exchangeStatus === "partially-filled";
  }

  return exchangeStatus === "cancelled" || exchangeStatus === "rejected";
}

function explainRow(row: Omit<OrderReconciliationRow, "beginnerExplanation">): string {
  if (row.status === "matched") {
    return "The local order and exchange snapshot agree.";
  }

  if (row.status === "missing-on-exchange") {
    return "AlphaDesk has a local order expectation, but the exchange snapshot did not return it.";
  }

  if (row.status === "orphan-on-exchange") {
    return "The exchange returned an order that is not present in the local AlphaDesk order list.";
  }

  return "The order exists in both places, but at least one important field does not agree.";
}

export function paperPositionsToLocalOrders(
  positions: PaperPosition[],
): LocalOrderRecord[] {
  return positions.map((position) => ({
    clientOrderId: position.id,
    expectedStatus: "expected-filled",
    id: position.id,
    product: position.product,
    quantity: position.quantity,
    side: position.side,
    source: "paper",
    symbol: position.symbol,
    updatedAt: position.closedAt ?? position.openedAt,
  }));
}

export function createSimulatedExchangeSnapshots(
  localOrders: LocalOrderRecord[],
): ExchangeOrderSnapshot[] {
  return localOrders.map((order) => ({
    clientOrderId: order.clientOrderId,
    exchange: "simulated",
    filledQuantity: order.quantity,
    id: `sim-${order.id}`,
    product: order.product,
    quantity: order.quantity,
    side: order.side,
    status: "filled",
    symbol: order.symbol,
    updatedAt: order.updatedAt,
  }));
}

export function reconcileOrders(
  localOrders: LocalOrderRecord[],
  exchangeOrders: ExchangeOrderSnapshot[],
  mode: ReconciliationMode,
  checkedAt = new Date().toISOString(),
): OrderReconciliationSummary {
  const exchangeByKey = new Map(exchangeOrders.map((order) => [exchangeKey(order), order]));
  const matchedExchangeKeys = new Set<string>();
  const rows: OrderReconciliationRow[] = [];

  for (const localOrder of localOrders) {
    const key = localKey(localOrder);
    const exchangeOrder = exchangeByKey.get(key);

    if (!exchangeOrder) {
      const row: Omit<OrderReconciliationRow, "beginnerExplanation"> = {
        issues: ["No exchange snapshot matched this local order id."],
        key,
        localOrder,
        severity: "fail",
        status: "missing-on-exchange",
      };

      rows.push({ ...row, beginnerExplanation: explainRow(row) });
      continue;
    }

    matchedExchangeKeys.add(exchangeKey(exchangeOrder));

    const issues: string[] = [];

    if (localOrder.symbol !== exchangeOrder.symbol) {
      issues.push(`Symbol mismatch: local ${localOrder.symbol}, exchange ${exchangeOrder.symbol}.`);
    }

    if (localOrder.side !== exchangeOrder.side) {
      issues.push(`Side mismatch: local ${localOrder.side}, exchange ${exchangeOrder.side}.`);
    }

    if (localOrder.product !== exchangeOrder.product) {
      issues.push(
        `Product mismatch: local ${localOrder.product}, exchange ${exchangeOrder.product}.`,
      );
    }

    if (Math.abs(localOrder.quantity - exchangeOrder.quantity) > QUANTITY_TOLERANCE) {
      issues.push(
        `Quantity mismatch: local ${localOrder.quantity}, exchange ${exchangeOrder.quantity}.`,
      );
    }

    if (!expectedMatchesExchange(localOrder.expectedStatus, exchangeOrder.status)) {
      issues.push(
        `Status mismatch: local ${localOrder.expectedStatus}, exchange ${exchangeOrder.status}.`,
      );
    }

    const row: Omit<OrderReconciliationRow, "beginnerExplanation"> = {
      exchangeOrder,
      issues,
      key,
      localOrder,
      severity: issues.length ? "warn" : "pass",
      status: issues.length ? "mismatch" : "matched",
    };

    rows.push({ ...row, beginnerExplanation: explainRow(row) });
  }

  for (const exchangeOrder of exchangeOrders) {
    const key = exchangeKey(exchangeOrder);

    if (matchedExchangeKeys.has(key)) {
      continue;
    }

    const row: Omit<OrderReconciliationRow, "beginnerExplanation"> = {
      exchangeOrder,
      issues: ["No local AlphaDesk order matched this exchange order id."],
      key,
      severity: "warn",
      status: "orphan-on-exchange",
    };

    rows.push({ ...row, beginnerExplanation: explainRow(row) });
  }

  const matched = rows.filter((row) => row.status === "matched").length;
  const mismatched = rows.filter((row) => row.status === "mismatch").length;
  const missingOnExchange = rows.filter(
    (row) => row.status === "missing-on-exchange",
  ).length;
  const orphanOnExchange = rows.filter(
    (row) => row.status === "orphan-on-exchange",
  ).length;
  const status: ReconciliationSeverity =
    missingOnExchange > 0 ? "fail" : mismatched > 0 || orphanOnExchange > 0 ? "warn" : "pass";

  return {
    checkedAt,
    matched,
    mismatched,
    missingOnExchange,
    mode,
    orphanOnExchange,
    rows,
    status,
    totalExchange: exchangeOrders.length,
    totalLocal: localOrders.length,
  };
}
