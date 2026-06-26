import type { AlphaConfig } from "./config";
import { getAlphaConfig, isProductLiveEnabled } from "./config";
import { fingerprintTrade } from "./risk-manager";
import type { ExchangeAdapterStatus, RiskDecision, TradeIntent } from "./types";

export const MANUAL_CONFIRMATION_PHRASE = "CONFIRM LIVE TRADE";

export type LiveExecutionGuardInput = {
  trade: TradeIntent;
  riskDecision: RiskDecision;
  exchangeStatus: ExchangeAdapterStatus;
  config?: AlphaConfig;
  adminPermission: boolean;
  manualConfirmation: string | boolean;
};

export type LiveExecutionDecision = {
  allowed: boolean;
  reasons: string[];
};

export function evaluateLiveExecutionGuards(
  input: LiveExecutionGuardInput,
): LiveExecutionDecision {
  const config = input.config ?? getAlphaConfig();
  const reasons: string[] = [];

  if (!config.liveTradingEnabled) {
    reasons.push("LIVE_TRADING_ENABLED is not true.");
  }

  if (!input.adminPermission) {
    reasons.push("Admin permission did not pass.");
  }

  if (config.emergencyStop) {
    reasons.push("Emergency stop is active.");
  }

  if (config.noTradeMode) {
    reasons.push("No-trade mode is active.");
  }

  const exchangeName = input.exchangeStatus.provider.toUpperCase();

  if (!input.exchangeStatus.credentialsReady) {
    reasons.push(`${exchangeName} API credentials are not configured server-side.`);
  }

  if (!input.exchangeStatus.testnet && !config.allowMainnetLiveTrading) {
    reasons.push(
      `${exchangeName} mainnet live trading requires ALLOW_MAINNET_LIVE_TRADING=true.`,
    );
  }

  if (!isProductLiveEnabled(config, input.trade.product)) {
    reasons.push(`Live trading is disabled for ${input.trade.product}.`);
  }

  const exactTradeApproved =
    input.riskDecision.approved &&
    input.riskDecision.approvedTradeFingerprint === fingerprintTrade(input.trade);

  if (!exactTradeApproved) {
    reasons.push("Risk Manager did not approve this exact trade.");
  }

  const manualConfirmed =
    input.manualConfirmation === true ||
    input.manualConfirmation === MANUAL_CONFIRMATION_PHRASE;

  if (!manualConfirmed) {
    reasons.push(`Manual confirmation phrase required: ${MANUAL_CONFIRMATION_PHRASE}.`);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
