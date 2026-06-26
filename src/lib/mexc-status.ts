import type { EnvLike } from "./config";
import { getAlphaConfig } from "./config";
import type { ExchangeAdapterStatus } from "./types";

export function getMexcAdapterStatus(
  env: EnvLike = process.env,
): ExchangeAdapterStatus {
  const config = getAlphaConfig(env);
  const hasApiKey = Boolean(env.MEXC_API_KEY?.trim());
  const hasApiSecret = Boolean(env.MEXC_API_SECRET?.trim());

  return {
    provider: "mexc",
    testnet: config.mexcOrderTestMode,
    orderTestMode: config.mexcOrderTestMode,
    baseUrl: "https://api.mexc.com",
    hasApiKey,
    hasApiSecret,
    credentialsReady: hasApiKey && hasApiSecret,
  };
}
