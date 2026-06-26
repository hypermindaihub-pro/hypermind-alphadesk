import type { PaperPosition, TradeProduct, TradeSide } from "./types";
import type { ReconciliationMode, ReconciliationSeverity } from "./order-reconciliation";

export type LocalPositionExposure = {
  key: string;
  source: "paper" | "live";
  symbol: string;
  side: TradeSide;
  product: TradeProduct;
  quantity: number;
  averageEntryPrice: number;
  markPrice: number;
  unrealizedPnlUsd: number;
  updatedAt: string;
};

export type ExchangePositionSnapshot = {
  key: string;
  exchange: "mexc" | "simulated";
  symbol: string;
  side: TradeSide;
  product: TradeProduct;
  quantity: number;
  averageEntryPrice: number;
  markPrice: number;
  unrealizedPnlUsd: number;
  leverage?: number;
  liquidationPrice?: number;
  updatedAt: string;
};

export type PositionReconciliationRow = {
  key: string;
  severity: ReconciliationSeverity;
  status: "matched" | "missing-on-exchange" | "mismatch" | "orphan-on-exchange";
  localExposure?: LocalPositionExposure;
  exchangePosition?: ExchangePositionSnapshot;
  issues: string[];
  beginnerExplanation: string;
};

export type PositionReconciliationSummary = {
  checkedAt: string;
  mode: ReconciliationMode;
  status: ReconciliationSeverity;
  matched: number;
  mismatched: number;
  missingOnExchange: number;
  orphanOnExchange: number;
  totalLocal: number;
  totalExchange: number;
  rows: PositionReconciliationRow[];
};

const QUANTITY_TOLERANCE = 0.00000001;
const PRICE_TOLERANCE_USD = 0.01;
const PNL_TOLERANCE_USD = 0.01;

export function positionExposureKey(
  symbol: string,
  side: TradeSide,
  product: TradeProduct,
): string {
  return `${product}:${symbol}:${side}`;
}

function explainRow(
  row: Omit<PositionReconciliationRow, "beginnerExplanation">,
): string {
  if (row.status === "matched") {
    return "Local exposure and exchange position agree.";
  }

  if (row.status === "missing-on-exchange") {
    return "AlphaDesk has local exposure, but the exchange position snapshot did not return matching exposure.";
  }

  if (row.status === "orphan-on-exchange") {
    return "The exchange returned exposure that is not represented in AlphaDesk local positions.";
  }

  return "The position exists in both places, but size, mark, entry, or P&L differs.";
}

export function paperPositionsToLocalExposure(
  positions: PaperPosition[],
): LocalPositionExposure[] {
  const grouped = new Map<string, PaperPosition[]>();

  for (const position of positions.filter((item) => !item.closedAt)) {
    const key = positionExposureKey(position.symbol, position.side, position.product);
    grouped.set(key, [...(grouped.get(key) ?? []), position]);
  }

  return Array.from(grouped.entries()).map(([key, items]) => {
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const weightedEntry = items.reduce(
      (sum, item) => sum + item.entryPrice * item.quantity,
      0,
    );
    const latest = items.reduce((current, item) =>
      item.openedAt > current.openedAt ? item : current,
    );

    return {
      averageEntryPrice: quantity ? weightedEntry / quantity : 0,
      key,
      markPrice: latest.markPrice,
      product: latest.product,
      quantity,
      side: latest.side,
      source: "paper",
      symbol: latest.symbol,
      unrealizedPnlUsd: items.reduce((sum, item) => sum + item.unrealizedPnlUsd, 0),
      updatedAt: latest.closedAt ?? latest.openedAt,
    };
  });
}

export function createSimulatedPositionSnapshots(
  localExposure: LocalPositionExposure[],
): ExchangePositionSnapshot[] {
  return localExposure.map((exposure) => ({
    averageEntryPrice: exposure.averageEntryPrice,
    exchange: "simulated",
    key: exposure.key,
    markPrice: exposure.markPrice,
    product: exposure.product,
    quantity: exposure.quantity,
    side: exposure.side,
    symbol: exposure.symbol,
    unrealizedPnlUsd: exposure.unrealizedPnlUsd,
    updatedAt: exposure.updatedAt,
  }));
}

export function reconcilePositions(
  localExposure: LocalPositionExposure[],
  exchangePositions: ExchangePositionSnapshot[],
  mode: ReconciliationMode,
  checkedAt = new Date().toISOString(),
): PositionReconciliationSummary {
  const exchangeByKey = new Map(exchangePositions.map((position) => [position.key, position]));
  const matchedExchangeKeys = new Set<string>();
  const rows: PositionReconciliationRow[] = [];

  for (const local of localExposure) {
    const exchangePosition = exchangeByKey.get(local.key);

    if (!exchangePosition) {
      const row: Omit<PositionReconciliationRow, "beginnerExplanation"> = {
        issues: ["No exchange position matched this local exposure."],
        key: local.key,
        localExposure: local,
        severity: "fail",
        status: "missing-on-exchange",
      };

      rows.push({ ...row, beginnerExplanation: explainRow(row) });
      continue;
    }

    matchedExchangeKeys.add(exchangePosition.key);

    const issues: string[] = [];

    if (Math.abs(local.quantity - exchangePosition.quantity) > QUANTITY_TOLERANCE) {
      issues.push(
        `Quantity mismatch: local ${local.quantity}, exchange ${exchangePosition.quantity}.`,
      );
    }

    if (
      Math.abs(local.averageEntryPrice - exchangePosition.averageEntryPrice) >
      PRICE_TOLERANCE_USD
    ) {
      issues.push(
        `Entry mismatch: local ${local.averageEntryPrice.toFixed(
          2,
        )}, exchange ${exchangePosition.averageEntryPrice.toFixed(2)}.`,
      );
    }

    if (Math.abs(local.markPrice - exchangePosition.markPrice) > PRICE_TOLERANCE_USD) {
      issues.push(
        `Mark mismatch: local ${local.markPrice.toFixed(
          2,
        )}, exchange ${exchangePosition.markPrice.toFixed(2)}.`,
      );
    }

    if (
      Math.abs(local.unrealizedPnlUsd - exchangePosition.unrealizedPnlUsd) >
      PNL_TOLERANCE_USD
    ) {
      issues.push(
        `P&L mismatch: local ${local.unrealizedPnlUsd.toFixed(
          2,
        )}, exchange ${exchangePosition.unrealizedPnlUsd.toFixed(2)}.`,
      );
    }

    const row: Omit<PositionReconciliationRow, "beginnerExplanation"> = {
      exchangePosition,
      issues,
      key: local.key,
      localExposure: local,
      severity: issues.length ? "warn" : "pass",
      status: issues.length ? "mismatch" : "matched",
    };

    rows.push({ ...row, beginnerExplanation: explainRow(row) });
  }

  for (const exchangePosition of exchangePositions) {
    if (matchedExchangeKeys.has(exchangePosition.key)) {
      continue;
    }

    const row: Omit<PositionReconciliationRow, "beginnerExplanation"> = {
      exchangePosition,
      issues: ["No local AlphaDesk exposure matched this exchange position."],
      key: exchangePosition.key,
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
    totalExchange: exchangePositions.length,
    totalLocal: localExposure.length,
  };
}
