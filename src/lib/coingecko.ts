import { fallbackMarkets } from "./sample-data";
import type { MarketDataResult, MarketSnapshot } from "./types";

type CachedMarketData = {
  assets: MarketSnapshot[];
  fetchedAtMs: number;
};

const CACHE_TTL_MS = 60_000;
const STALE_TTL_MS = 5 * 60_000;
let cachedMarketData: CachedMarketData | null = null;

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function signalFor(change24h: number): MarketSnapshot["signal"] {
  if (change24h > 2.25) {
    return "accumulate";
  }

  if (change24h < -3) {
    return "reduce";
  }

  return "wait";
}

function riskFor(change24h: number): MarketSnapshot["risk"] {
  const absChange = Math.abs(change24h);

  if (absChange > 6) {
    return "high";
  }

  if (absChange > 2) {
    return "medium";
  }

  return "low";
}

function buildResult(
  assets: MarketSnapshot[],
  freshness: MarketDataResult["status"]["freshness"],
  source: MarketDataResult["status"]["source"],
  fetchedAtMs: number,
  message: string,
  nowMs = Date.now(),
): MarketDataResult {
  return {
    assets,
    status: {
      provider: "CoinGecko",
      freshness,
      source,
      fetchedAt: new Date(fetchedAtMs).toISOString(),
      cacheAgeMs: Math.max(0, nowMs - fetchedAtMs),
      message,
    },
  };
}

export async function getMarketData(
  fetchImpl: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<MarketDataResult> {
  if (cachedMarketData && nowMs - cachedMarketData.fetchedAtMs < CACHE_TTL_MS) {
    return buildResult(
      cachedMarketData.assets,
      "fresh",
      "cache",
      cachedMarketData.fetchedAtMs,
      "Serving fresh cached CoinGecko data.",
      nowMs,
    );
  }

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,chainlink&order=market_cap_desc&per_page=4&page=1&sparkline=false&price_change_percentage=24h",
      {
        headers: {
          accept: "application/json",
        },
        next: { revalidate: 60 },
      } as RequestInit & { next: { revalidate: number } },
      6_000,
    );

    if (!response.ok) {
      throw new Error(`CoinGecko HTTP ${response.status}`);
    }

    const payload = (await response.json()) as Array<{
      id: string;
      symbol: string;
      name: string;
      current_price: number;
      price_change_percentage_24h: number | null;
      market_cap: number;
      total_volume: number;
      last_updated: string;
    }>;

    const assets = payload.map((asset) => {
      const change24h = asset.price_change_percentage_24h ?? 0;

      return {
        id: asset.id,
        symbol: asset.symbol.toUpperCase(),
        name: asset.name,
        price: asset.current_price,
        change24h,
        marketCap: asset.market_cap,
        volume24h: asset.total_volume,
        signal: signalFor(change24h),
        risk: riskFor(change24h),
        updatedAt: asset.last_updated,
      };
    });

    cachedMarketData = {
      assets,
      fetchedAtMs: nowMs,
    };

    return buildResult(
      assets,
      "fresh",
      "coingecko",
      nowMs,
      "Live CoinGecko data fetched successfully.",
      nowMs,
    );
  } catch {
    if (cachedMarketData && nowMs - cachedMarketData.fetchedAtMs < STALE_TTL_MS) {
      return buildResult(
        cachedMarketData.assets,
        "stale",
        "cache",
        cachedMarketData.fetchedAtMs,
        "CoinGecko is unavailable, so AlphaDesk is serving stale cached data.",
        nowMs,
      );
    }

    return buildResult(
      fallbackMarkets,
      "fallback",
      "fallback",
      Date.parse(fallbackMarkets[0]?.updatedAt ?? new Date(nowMs).toISOString()),
      "CoinGecko is unavailable and no usable cache exists, so labeled fallback data is shown.",
      nowMs,
    );
  }
}

export function resetMarketCacheForTests(): void {
  cachedMarketData = null;
}
