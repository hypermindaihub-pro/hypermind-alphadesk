import "server-only";

import crypto from "node:crypto";
import type { EnvLike } from "./config";
import { getAlphaConfig } from "./config";
import { summarizeError } from "./error-summary";
import { getMexcAdapterStatus } from "./mexc-status";
import {
  evaluateLiveExecutionGuards,
  type LiveExecutionGuardInput,
} from "./execution-guards";
import type { ExchangeOrderSnapshot } from "./order-reconciliation";
import type { TradeSide } from "./types";
import type { ExchangeWalletBalance } from "./wallet-reconciliation";

export type MexcAccountInfo = {
  accountModeLabel: string;
  canTrade?: boolean;
  canWithdraw?: boolean;
  canDeposit?: boolean;
  permissions?: string[];
  updatedAt?: string;
};

export type MexcOrderSubmissionEvidence = {
  retCode?: number;
  retMsg?: string;
  orderId?: string;
  orderLinkId?: string;
  testOrder?: boolean;
};

export type MexcOrderResult = {
  submitted: boolean;
  testnet: boolean;
  exchange: "mexc";
  reasons: string[];
  order?: MexcOrderSubmissionEvidence;
  response?: MexcOrderSubmissionEvidence;
};

type MexcErrorPayload = {
  code?: number;
  msg?: string;
};

type MexcCreateOrderResponse = MexcErrorPayload & {
  orderId?: string | number;
  clientOrderId?: string;
  transactTime?: number;
};

type MexcOrder = {
  symbol?: string;
  orderId?: string | number;
  clientOrderId?: string;
  origQty?: string;
  executedQty?: string;
  status?: string;
  side?: string;
  updateTime?: number;
  time?: number;
};

type MexcAccountResponse = MexcErrorPayload & {
  accountType?: string;
  canTrade?: boolean;
  canWithdraw?: boolean;
  canDeposit?: boolean;
  updateTime?: number | null;
  balances?: Array<{
    asset?: string;
    free?: string;
    locked?: string;
    available?: string;
  }>;
  permissions?: string[];
};

function mexcSide(side: TradeSide): "BUY" | "SELL" {
  return side === "long" ? "BUY" : "SELL";
}

function alphaSide(side: unknown): TradeSide {
  return side === "SELL" ? "short" : "long";
}

function alphaOrderStatus(status: unknown): ExchangeOrderSnapshot["status"] {
  if (status === "FILLED") {
    return "filled";
  }

  if (status === "PARTIALLY_FILLED") {
    return "partially-filled";
  }

  if (status === "CANCELED" || status === "EXPIRED") {
    return "cancelled";
  }

  if (status === "REJECTED") {
    return "rejected";
  }

  return "open";
}

function alphaOrderLinkId(tradeId: string): string {
  const safeId = tradeId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 24);

  return `alpha-${safeId}`;
}

function requestTimeoutMs(env: EnvLike): number {
  const timeoutMs = getAlphaConfig(env).exchangeRequestTimeoutMs;

  if (!Number.isFinite(timeoutMs)) {
    return 8000;
  }

  return Math.min(Math.max(timeoutMs, 1000), 30000);
}

function signedQuery(env: EnvLike, params: URLSearchParams): string {
  const apiSecret = env.MEXC_API_SECRET?.trim() ?? "";
  const payload = params.toString();
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(payload)
    .digest("hex");

  params.set("signature", signature);

  return params.toString();
}

async function fetchSignedMexc(input: {
  env: EnvLike;
  fetchImpl?: typeof fetch;
  method: "GET" | "POST";
  params: URLSearchParams;
  path: string;
}): Promise<Response> {
  const timeoutMs = requestTimeoutMs(input.env);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`MEXC request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  const status = getMexcAdapterStatus(input.env);
  const queryString = signedQuery(input.env, input.params);

  try {
    return await (input.fetchImpl ?? fetch)(`${status.baseUrl}${input.path}?${queryString}`, {
      headers: {
        "Content-Type": "application/json",
        "X-MEXC-APIKEY": input.env.MEXC_API_KEY?.trim() ?? "",
      },
      method: input.method,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function mexcOrderToSnapshot(order: MexcOrder): ExchangeOrderSnapshot | null {
  const orderId = String(order.orderId ?? "").trim();
  const symbol = order.symbol?.trim().toUpperCase();

  if (!orderId || !symbol) {
    return null;
  }

  return {
    clientOrderId: order.clientOrderId?.trim() || undefined,
    exchange: "mexc",
    filledQuantity: Number(order.executedQty ?? 0),
    id: orderId,
    product: "spot",
    quantity: Number(order.origQty ?? 0),
    side: alphaSide(order.side),
    status: alphaOrderStatus(order.status),
    symbol,
    updatedAt: new Date(Number(order.updateTime ?? order.time ?? Date.now())).toISOString(),
  };
}

function mexcErrorMessage(payload: MexcErrorPayload, status: number): string {
  if (payload.msg) {
    return payload.code === undefined ? payload.msg : `${payload.msg} (${payload.code})`;
  }

  return `HTTP ${status}`;
}

export async function submitGuardedMexcOrder(
  input: Omit<LiveExecutionGuardInput, "exchangeStatus" | "config"> & {
    env?: EnvLike;
    fetchImpl?: typeof fetch;
  },
): Promise<MexcOrderResult> {
  const env = input.env ?? process.env;
  const config = getAlphaConfig(env);
  const mexcStatus = getMexcAdapterStatus(env);
  const guardDecision = evaluateLiveExecutionGuards({
    trade: input.trade,
    riskDecision: input.riskDecision,
    adminPermission: input.adminPermission,
    manualConfirmation: input.manualConfirmation,
    config,
    exchangeStatus: mexcStatus,
  });

  if (!guardDecision.allowed) {
    return {
      submitted: false,
      testnet: mexcStatus.testnet,
      exchange: "mexc",
      reasons: guardDecision.reasons,
    };
  }

  if (input.trade.product !== "spot") {
    return {
      submitted: false,
      testnet: mexcStatus.testnet,
      exchange: "mexc",
      reasons: ["MEXC Spot adapter currently supports spot live orders only."],
    };
  }

  const params = new URLSearchParams({
    newClientOrderId: alphaOrderLinkId(input.trade.id),
    recvWindow: "5000",
    side: mexcSide(input.trade.side),
    symbol: input.trade.symbol,
    timestamp: String(Date.now()),
    type: "MARKET",
  });

  if (input.trade.side === "long") {
    params.set("quoteOrderQty", String(Number((input.trade.quantity * input.trade.entryPrice).toFixed(6))));
  } else {
    params.set("quantity", String(input.trade.quantity));
  }

  let response: Response;

  try {
    response = await fetchSignedMexc({
      env,
      fetchImpl: input.fetchImpl,
      method: "POST",
      params,
      path: mexcStatus.orderTestMode ? "/api/v3/order/test" : "/api/v3/order",
    });
  } catch (error) {
    return {
      submitted: false,
      testnet: mexcStatus.testnet,
      exchange: "mexc",
      reasons: [`MEXC order request failed: ${summarizeError(error, "unknown network failure")}.`],
    };
  }

  const payload = (await response.json().catch(() => ({}))) as MexcCreateOrderResponse;
  const accepted = response.ok && payload.code === undefined;
  const order: MexcOrderSubmissionEvidence = {
    retCode: payload.code,
    retMsg: payload.msg,
    orderId: payload.orderId === undefined ? undefined : String(payload.orderId),
    orderLinkId: payload.clientOrderId ?? params.get("newClientOrderId") ?? undefined,
    testOrder: mexcStatus.orderTestMode,
  };

  return {
    submitted: accepted,
    testnet: mexcStatus.testnet,
    exchange: "mexc",
    reasons: accepted
      ? mexcStatus.orderTestMode
        ? ["MEXC test order accepted; no real order was sent to the matching engine."]
        : []
      : [`MEXC rejected order: ${mexcErrorMessage(payload, response.status)}.`],
    order,
    response: order,
  };
}

export async function fetchMexcOrderSnapshots(input: {
  env?: EnvLike;
  fetchImpl?: typeof fetch;
  symbols: string[];
}): Promise<ExchangeOrderSnapshot[]> {
  const env = input.env ?? process.env;
  const status = getMexcAdapterStatus(env);

  if (!status.credentialsReady) {
    return [];
  }

  const params = new URLSearchParams({
    symbol: Array.from(new Set(input.symbols.map((symbol) => symbol.toUpperCase()))).slice(0, 5).join(","),
    timestamp: String(Date.now()),
  });
  const response = await fetchSignedMexc({
    env,
    fetchImpl: input.fetchImpl,
    method: "GET",
    params,
    path: "/api/v3/openOrders",
  });
  const payload = (await response.json().catch(() => [])) as MexcOrder[] | MexcErrorPayload;

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(`MEXC open-order polling failed: ${mexcErrorMessage(payload as MexcErrorPayload, response.status)}`);
  }

  return payload
    .map(mexcOrderToSnapshot)
    .filter((order): order is ExchangeOrderSnapshot => Boolean(order));
}

export async function fetchMexcOrderHistorySnapshots(input: {
  env?: EnvLike;
  fetchImpl?: typeof fetch;
  symbols: string[];
}): Promise<ExchangeOrderSnapshot[]> {
  const env = input.env ?? process.env;
  const status = getMexcAdapterStatus(env);

  if (!status.credentialsReady) {
    return [];
  }

  const snapshots: ExchangeOrderSnapshot[] = [];

  for (const symbol of Array.from(new Set(input.symbols.map((item) => item.toUpperCase())))) {
    const params = new URLSearchParams({
      limit: "100",
      symbol,
      timestamp: String(Date.now()),
    });
    const response = await fetchSignedMexc({
      env,
      fetchImpl: input.fetchImpl,
      method: "GET",
      params,
      path: "/api/v3/allOrders",
    });
    const payload = (await response.json().catch(() => [])) as MexcOrder[] | MexcErrorPayload;

    if (!response.ok || !Array.isArray(payload)) {
      throw new Error(`MEXC order-history polling failed for ${symbol}: ${mexcErrorMessage(payload as MexcErrorPayload, response.status)}`);
    }

    for (const order of payload) {
      const snapshot = mexcOrderToSnapshot(order);

      if (snapshot) {
        snapshots.push(snapshot);
      }
    }
  }

  return snapshots;
}

export async function fetchMexcAccountInfo(input: {
  env?: EnvLike;
  fetchImpl?: typeof fetch;
} = {}): Promise<MexcAccountInfo | null> {
  const env = input.env ?? process.env;
  const status = getMexcAdapterStatus(env);

  if (!status.credentialsReady) {
    return null;
  }

  const params = new URLSearchParams({
    timestamp: String(Date.now()),
  });
  const response = await fetchSignedMexc({
    env,
    fetchImpl: input.fetchImpl,
    method: "GET",
    params,
    path: "/api/v3/account",
  });
  const payload = (await response.json().catch(() => ({}))) as MexcAccountResponse;

  if (!response.ok || payload.code !== undefined) {
    throw new Error(`MEXC account info polling failed: ${mexcErrorMessage(payload, response.status)}`);
  }

  return {
    accountModeLabel: payload.accountType ?? "SPOT",
    canDeposit: payload.canDeposit,
    canTrade: payload.canTrade,
    canWithdraw: payload.canWithdraw,
    permissions: payload.permissions,
    updatedAt: payload.updateTime ? new Date(payload.updateTime).toISOString() : undefined,
  };
}

export async function fetchMexcWalletBalances(input: {
  coins: string[];
  env?: EnvLike;
  fetchImpl?: typeof fetch;
}): Promise<ExchangeWalletBalance[]> {
  const env = input.env ?? process.env;
  const account = await fetchMexcAccountInfo({
    env,
    fetchImpl: input.fetchImpl,
  });

  if (!account) {
    return [];
  }

  const params = new URLSearchParams({
    timestamp: String(Date.now()),
  });
  const response = await fetchSignedMexc({
    env,
    fetchImpl: input.fetchImpl,
    method: "GET",
    params,
    path: "/api/v3/account",
  });
  const payload = (await response.json().catch(() => ({}))) as MexcAccountResponse;
  const wanted = new Set(input.coins.map((coin) => coin.trim().toUpperCase()).filter(Boolean));
  const now = new Date().toISOString();

  if (!response.ok || payload.code !== undefined) {
    throw new Error(`MEXC wallet polling failed: ${mexcErrorMessage(payload, response.status)}`);
  }

  return (payload.balances ?? [])
    .filter((balance) => {
      const asset = balance.asset?.trim().toUpperCase();

      return asset && (!wanted.size || wanted.has(asset));
    })
    .map((balance): ExchangeWalletBalance => {
      const free = Number(balance.free ?? 0);
      const locked = Number(balance.locked ?? 0);

      return {
        borrowed: 0,
        coin: balance.asset?.trim().toUpperCase() ?? "",
        equity: free + locked,
        exchange: "mexc",
        locked,
        updatedAt: now,
        usdValue: 0,
        walletBalance: free + locked,
      };
    });
}
