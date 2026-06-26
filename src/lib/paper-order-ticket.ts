import { createJournalEntry } from "./journal";
import { markPaperPosition, openPaperPosition } from "./paper-trading";
import type { JournalEntry, PaperPosition, TradeIntent, TradeProduct, TradeSide } from "./types";

export type PaperOrderTicketInput = {
  id?: string;
  symbol?: string | null;
  side?: string | null;
  product?: string | null;
  quantity?: string | number | null;
  entryPrice?: string | number | null;
  stopLoss?: string | number | null;
  takeProfit?: string | number | null;
  leverage?: string | number | null;
  confidence?: string | number | null;
  thesis?: string | null;
};

export type PaperOrderTicketPreview = {
  valid: boolean;
  trade: TradeIntent;
  errors: string[];
  warnings: string[];
  notionalUsd: number;
  riskUsd: number;
  rewardUsd?: number;
  riskRewardRatio?: number;
  beginnerExplanation: string;
};

export type PaperOrderTicketExecution = {
  preview: PaperOrderTicketPreview;
  position?: PaperPosition;
  audit?: JournalEntry;
};

function normalizeSymbol(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function readNumber(value: string | number | null | undefined, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value ?? "").trim());

  return Number.isFinite(parsed) ? parsed : fallback;
}

function readConfidence(value: string | number | null | undefined): number {
  const parsed = readNumber(value, 0.62);

  if (parsed > 1) {
    return parsed / 100;
  }

  return parsed;
}

function readSide(value: string | null | undefined): TradeSide {
  return value === "short" ? "short" : "long";
}

function readProduct(value: string | null | undefined): TradeProduct {
  return value === "derivatives" ? "derivatives" : "spot";
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

export function buildPaperOrderTicket(
  input: PaperOrderTicketInput,
  nowMs = Date.now(),
): PaperOrderTicketPreview {
  const symbol = normalizeSymbol(input.symbol);
  const side = readSide(input.side);
  const product = readProduct(input.product);
  const quantity = readNumber(input.quantity);
  const entryPrice = readNumber(input.entryPrice);
  const stopLoss = readNumber(input.stopLoss);
  const takeProfitRaw = input.takeProfit === "" ? undefined : input.takeProfit;
  const takeProfit =
    takeProfitRaw === undefined || takeProfitRaw === null
      ? undefined
      : readNumber(takeProfitRaw);
  const leverage = readNumber(input.leverage, 1);
  const confidence = readConfidence(input.confidence);
  const trade: TradeIntent = {
    confidence,
    entryPrice,
    id: input.id ?? `ticket-${symbol.toLowerCase()}-${nowMs}`,
    leverage,
    product,
    quantity,
    side,
    stopLoss,
    symbol,
    takeProfit,
    thesis: input.thesis?.trim() || "Paper order ticket submitted without a detailed thesis.",
  };
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) {
    errors.push("Symbol must use uppercase market text such as BTCUSDT.");
  }

  if (!symbol.endsWith("USDT") && !symbol.endsWith("USDC")) {
    warnings.push("Ticket is not quoted in USDT or USDC; verify the market symbol manually.");
  }

  if (quantity <= 0) {
    errors.push("Quantity must be greater than zero.");
  }

  if (entryPrice <= 0) {
    errors.push("Entry price must be greater than zero.");
  }

  if (stopLoss <= 0) {
    errors.push("A hard stop loss is required.");
  }

  if (leverage < 1) {
    errors.push("Leverage must be at least 1x.");
  }

  if (confidence <= 0 || confidence > 1) {
    errors.push("Confidence must be between 1% and 100%.");
  }

  if (side === "short" && product === "spot") {
    errors.push("Short paper tickets must use derivatives, not spot.");
  }

  if (entryPrice > 0 && stopLoss > 0) {
    if (side === "long" && stopLoss >= entryPrice) {
      errors.push("Long tickets need a stop loss below entry.");
    }

    if (side === "short" && stopLoss <= entryPrice) {
      errors.push("Short tickets need a stop loss above entry.");
    }
  }

  if (takeProfit !== undefined && takeProfit <= 0) {
    errors.push("Take-profit must be greater than zero when provided.");
  }

  if (takeProfit !== undefined && entryPrice > 0 && takeProfit > 0) {
    if (side === "long" && takeProfit <= entryPrice) {
      warnings.push("Long take-profit is not above entry; reward preview will be weak.");
    }

    if (side === "short" && takeProfit >= entryPrice) {
      warnings.push("Short take-profit is not below entry; reward preview will be weak.");
    }
  }

  const notionalUsd = round(quantity * entryPrice * leverage);
  const riskUsd = round(Math.abs(entryPrice - stopLoss) * quantity * leverage);
  const rewardUsd =
    takeProfit === undefined
      ? undefined
      : round(Math.abs(takeProfit - entryPrice) * quantity * leverage);
  const riskRewardRatio =
    rewardUsd === undefined || riskUsd <= 0 ? undefined : Number((rewardUsd / riskUsd).toFixed(2));

  if (riskUsd > 0 && notionalUsd > 0 && riskUsd / notionalUsd > 0.08) {
    warnings.push("Risk at stop is above 8% of ticket notional; consider reducing size.");
  }

  return {
    beginnerExplanation:
      errors.length > 0
        ? "The ticket is not ready for paper execution. Fix each error first."
        : "The ticket is valid for local paper execution. It still does not call MEXC or enable live trading.",
    errors,
    notionalUsd,
    rewardUsd,
    riskRewardRatio,
    riskUsd,
    trade,
    valid: errors.length === 0,
    warnings,
  };
}

export function executePaperOrderTicket(
  input: PaperOrderTicketInput,
  markPrice?: number,
  openedAt = new Date().toISOString(),
  nowMs = Date.now(),
): PaperOrderTicketExecution {
  const preview = buildPaperOrderTicket(input, nowMs);

  if (!preview.valid) {
    return { preview };
  }

  const opened = openPaperPosition(preview.trade, openedAt);
  const position = markPaperPosition(opened, markPrice ?? preview.trade.entryPrice);
  const audit = createJournalEntry({
    actor: "paper-trading",
    event: "paper-ticket-open",
    summary: `Opened paper ticket ${preview.trade.symbol} ${preview.trade.side} with ${preview.trade.leverage}x leverage.`,
    metadata: {
      notionalUsd: preview.notionalUsd,
      paperOnly: true,
      riskUsd: preview.riskUsd,
      side: preview.trade.side,
      symbol: preview.trade.symbol,
    },
  });

  return { audit, position, preview };
}
