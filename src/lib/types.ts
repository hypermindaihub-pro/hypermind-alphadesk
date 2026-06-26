export type TradeSide = "long" | "short";

export type TradeProduct = "spot" | "derivatives";

export type MarketFreshness = "fresh" | "stale" | "fallback";

export type MarketSnapshot = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  signal: "accumulate" | "wait" | "reduce";
  risk: "low" | "medium" | "high";
  updatedAt: string;
};

export type MarketDataStatus = {
  provider: "CoinGecko";
  freshness: MarketFreshness;
  source: "coingecko" | "cache" | "fallback";
  fetchedAt: string;
  cacheAgeMs: number;
  message: string;
};

export type MarketDataResult = {
  assets: MarketSnapshot[];
  status: MarketDataStatus;
};

export type TradeIntent = {
  id: string;
  symbol: string;
  side: TradeSide;
  product: TradeProduct;
  quantity: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  leverage: number;
  confidence: number;
  thesis: string;
};

export type RiskDecision = {
  approved: boolean;
  score: number;
  vetoReasons: string[];
  warnings: string[];
  approvedTradeFingerprint?: string;
  explanation: string;
};

export type PortfolioState = {
  equityUsd: number;
  cashUsd: number;
  dailyRealizedPnlUsd: number;
  dailyDrawdownPct: number;
};

export type PaperPosition = {
  id: string;
  symbol: string;
  side: TradeSide;
  product: TradeProduct;
  quantity: number;
  entryPrice: number;
  markPrice: number;
  openedAt: string;
  closedAt?: string;
  realizedPnlUsd?: number;
  unrealizedPnlUsd: number;
};

export type JournalEntry = {
  id: string;
  timestamp: string;
  actor: "system" | "agent" | "risk-manager" | "paper-trading" | "user";
  event: string;
  summary: string;
  metadata: Record<string, string | number | boolean>;
};

export type ExchangeAdapterStatus = {
  provider: "mexc";
  testnet: boolean;
  baseUrl: string;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  credentialsReady: boolean;
  orderTestMode: boolean;
};

export type CostUsage = {
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  dailyBudgetUsd: number;
  hardStopUsd: number;
  allowed: boolean;
  message: string;
};

export type HealthCheck = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};
