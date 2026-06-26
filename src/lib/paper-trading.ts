import type { PaperPosition, TradeIntent } from "./types";

export function calculatePaperPnl(
  side: "long" | "short",
  quantity: number,
  entryPrice: number,
  exitPrice: number,
): number {
  const direction = side === "long" ? 1 : -1;

  return Number(((exitPrice - entryPrice) * quantity * direction).toFixed(2));
}

export function openPaperPosition(
  trade: TradeIntent,
  openedAt = new Date().toISOString(),
): PaperPosition {
  return {
    id: `paper-${trade.id}`,
    symbol: trade.symbol,
    side: trade.side,
    product: trade.product,
    quantity: trade.quantity,
    entryPrice: trade.entryPrice,
    markPrice: trade.entryPrice,
    openedAt,
    unrealizedPnlUsd: 0,
  };
}

export function markPaperPosition(
  position: PaperPosition,
  markPrice: number,
): PaperPosition {
  return {
    ...position,
    markPrice,
    unrealizedPnlUsd: calculatePaperPnl(
      position.side,
      position.quantity,
      position.entryPrice,
      markPrice,
    ),
  };
}

export function closePaperPosition(
  position: PaperPosition,
  exitPrice: number,
  closedAt = new Date().toISOString(),
): PaperPosition {
  const realizedPnlUsd = calculatePaperPnl(
    position.side,
    position.quantity,
    position.entryPrice,
    exitPrice,
  );

  return {
    ...position,
    markPrice: exitPrice,
    closedAt,
    realizedPnlUsd,
    unrealizedPnlUsd: 0,
  };
}
