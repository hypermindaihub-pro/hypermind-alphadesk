import type {
  AlphaConfig,
} from "./config";
import { getAlphaConfig } from "./config";
import type { PortfolioState, RiskDecision, TradeIntent } from "./types";

export function fingerprintTrade(trade: TradeIntent): string {
  return [
    trade.id,
    trade.symbol,
    trade.side,
    trade.product,
    trade.quantity,
    trade.entryPrice,
    trade.stopLoss,
    trade.takeProfit ?? "none",
    trade.leverage,
  ].join("|");
}

function formatUsd(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function evaluateRisk(
  trade: TradeIntent,
  portfolio: PortfolioState,
  config: AlphaConfig = getAlphaConfig(),
): RiskDecision {
  const vetoReasons: string[] = [];
  const warnings: string[] = [];
  const notionalUsd = trade.quantity * trade.entryPrice * trade.leverage;
  const riskPerUnit = Math.abs(trade.entryPrice - trade.stopLoss);
  const riskUsd = riskPerUnit * trade.quantity * trade.leverage;
  const riskPctOfEquity = portfolio.equityUsd === 0 ? 100 : (riskUsd / portfolio.equityUsd) * 100;

  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    vetoReasons.push("Trade notional must be greater than zero.");
  }

  if (notionalUsd > config.risk.maxPositionUsd) {
    vetoReasons.push(
      `Position size ${formatUsd(notionalUsd)} exceeds the ${formatUsd(
        config.risk.maxPositionUsd,
      )} limit.`,
    );
  }

  if (trade.leverage > config.risk.maxLeverage) {
    vetoReasons.push(
      `Leverage ${trade.leverage}x exceeds the ${config.risk.maxLeverage}x cap.`,
    );
  }

  if (portfolio.dailyDrawdownPct > config.risk.maxDailyDrawdownPct) {
    vetoReasons.push(
      `Daily drawdown ${portfolio.dailyDrawdownPct.toFixed(
        1,
      )}% exceeds the ${config.risk.maxDailyDrawdownPct}% cap.`,
    );
  }

  if (!Number.isFinite(trade.stopLoss) || trade.stopLoss <= 0) {
    vetoReasons.push("A hard stop loss is required before approval.");
  }

  if (trade.confidence < config.risk.minConfidence) {
    vetoReasons.push(
      `Agent confidence ${(trade.confidence * 100).toFixed(
        0,
      )}% is below the ${(config.risk.minConfidence * 100).toFixed(0)}% minimum.`,
    );
  }

  if (trade.side === "short" && trade.product === "spot") {
    vetoReasons.push("Short ideas must use the derivatives product, not spot.");
  }

  if (riskPctOfEquity > 1.5) {
    warnings.push(
      `Risk at stop is ${riskPctOfEquity.toFixed(
        2,
      )}% of equity; consider reducing size.`,
    );
  }

  if (trade.takeProfit === undefined) {
    warnings.push("No take-profit target supplied; track exit discipline manually.");
  }

  const scorePenalty = vetoReasons.length * 25 + warnings.length * 7 + Math.max(0, riskPctOfEquity - 1) * 6;
  const score = Math.max(0, Math.round(100 - scorePenalty));
  const approved = vetoReasons.length === 0;

  return {
    approved,
    score,
    vetoReasons,
    warnings,
    approvedTradeFingerprint: approved ? fingerprintTrade(trade) : undefined,
    explanation: approved
      ? "Risk Manager approved this exact trade shape for paper execution. Live execution still requires every live guard."
      : "Risk Manager vetoed the trade. Resolve each veto before any execution path can proceed.",
  };
}
