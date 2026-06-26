import type { TradeProduct } from "./types";

export type EnvLike = Record<string, string | undefined>;

export type AlphaConfig = {
  appName: string;
  paperTradingEnabled: boolean;
  liveTradingEnabled: boolean;
  liveTestnetValidation: boolean;
  exchangeProvider: "mexc";
  mexcOrderTestMode: boolean;
  allowMainnetLiveTrading: boolean;
  emergencyStop: boolean;
  noTradeMode: boolean;
  products: {
    spotLiveTrading: boolean;
    derivativesLiveTrading: boolean;
  };
  risk: {
    maxPositionUsd: number;
    maxLeverage: number;
    maxDailyDrawdownPct: number;
    minConfidence: number;
  };
  cost: {
    dailyBudgetUsd: number;
    hardStopUsd: number;
  };
  openAiModel: string;
  exchangeRequestTimeoutMs: number;
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

function readFlag(env: EnvLike, key: string, defaultValue: boolean): boolean {
  const raw = env[key];

  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }

  const normalized = raw.trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return defaultValue;
}

function readNumber(env: EnvLike, key: string, defaultValue: number): number {
  const raw = env[key];
  const parsed = raw === undefined ? Number.NaN : Number(raw);

  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function getAlphaConfig(env: EnvLike = process.env): AlphaConfig {
  return {
    appName: env.NEXT_PUBLIC_APP_NAME ?? "Hypermind AlphaDesk",
    paperTradingEnabled: readFlag(env, "PAPER_TRADING_ENABLED", true),
    liveTradingEnabled: readFlag(env, "LIVE_TRADING_ENABLED", false),
    liveTestnetValidation: readFlag(env, "ALPHADESK_ENABLE_LIVE_TESTNET_E2E", false),
    exchangeProvider: "mexc",
    mexcOrderTestMode: readFlag(env, "MEXC_ORDER_TEST_MODE", true),
    allowMainnetLiveTrading: readFlag(env, "ALLOW_MAINNET_LIVE_TRADING", false),
    emergencyStop: readFlag(env, "EMERGENCY_STOP", false),
    noTradeMode: readFlag(env, "NO_TRADE_MODE", false),
    products: {
      spotLiveTrading: readFlag(env, "PRODUCT_SPOT_LIVE_ENABLED", false),
      derivativesLiveTrading: readFlag(
        env,
        "PRODUCT_DERIVATIVES_LIVE_ENABLED",
        false,
      ),
    },
    risk: {
      maxPositionUsd: readNumber(env, "RISK_MAX_POSITION_USD", 2500),
      maxLeverage: readNumber(env, "RISK_MAX_LEVERAGE", 2),
      maxDailyDrawdownPct: readNumber(env, "RISK_MAX_DAILY_DRAWDOWN_PCT", 3),
      minConfidence: readNumber(env, "RISK_MIN_CONFIDENCE", 0.62),
    },
    cost: {
      dailyBudgetUsd: readNumber(env, "OPENAI_DAILY_BUDGET_USD", 5),
      hardStopUsd: readNumber(env, "OPENAI_HARD_STOP_USD", 8),
    },
    openAiModel: env.OPENAI_MODEL ?? "gpt-5-mini",
    exchangeRequestTimeoutMs: readNumber(env, "MEXC_REQUEST_TIMEOUT_MS", 8000),
  };
}

export function isProductLiveEnabled(
  config: AlphaConfig,
  product: TradeProduct,
): boolean {
  if (product === "spot") {
    return config.products.spotLiveTrading;
  }

  return config.products.derivativesLiveTrading;
}
