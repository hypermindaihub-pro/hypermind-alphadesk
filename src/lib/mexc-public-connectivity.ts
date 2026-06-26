import dns from "node:dns/promises";
import type { EnvLike } from "./config";
import { getAlphaConfig } from "./config";
import { summarizeError } from "./error-summary";

export type MexcPublicConnectivity = {
  checkedAt: string;
  endpoint: string;
  hostname: string;
  ok: boolean;
  timeoutMs: number;
  dns: {
    ok: boolean;
    addresses: Array<{ address: string; family: number }>;
    error?: string;
  };
  publicServerTime: {
    ok: boolean;
    httpStatus?: number;
    serverTimePresent?: boolean;
    error?: string;
  };
};

function requestTimeoutMs(env: EnvLike): number {
  const configured = getAlphaConfig(env).exchangeRequestTimeoutMs;

  if (!Number.isFinite(configured)) {
    return 8000;
  }

  return Math.min(Math.max(configured, 1000), 30000);
}

export async function checkMexcPublicConnectivity(input: {
  env?: EnvLike;
  fetchImpl?: typeof fetch;
} = {}): Promise<MexcPublicConnectivity> {
  const env = input.env ?? process.env;
  const endpoint = "https://api.mexc.com";
  const hostname = "api.mexc.com";
  const timeoutMs = requestTimeoutMs(env);
  const dnsResult: MexcPublicConnectivity["dns"] = {
    ok: false,
    addresses: [],
  };
  const publicServerTime: MexcPublicConnectivity["publicServerTime"] = {
    ok: false,
  };

  try {
    dnsResult.addresses = await dns.lookup(hostname, { all: true });
    dnsResult.ok = dnsResult.addresses.length > 0;
  } catch (error) {
    dnsResult.error = summarizeError(error, "MEXC DNS lookup failed.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`MEXC public request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const response = await (input.fetchImpl ?? fetch)(`${endpoint}/api/v3/time`, {
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      serverTime?: number;
    };

    publicServerTime.httpStatus = response.status;
    publicServerTime.serverTimePresent = typeof payload.serverTime === "number";
    publicServerTime.ok = response.ok && publicServerTime.serverTimePresent;
  } catch (error) {
    publicServerTime.error = summarizeError(error, "MEXC public server-time fetch failed.");
  } finally {
    clearTimeout(timeout);
  }

  return {
    checkedAt: new Date().toISOString(),
    dns: dnsResult,
    endpoint,
    hostname,
    ok: dnsResult.ok && publicServerTime.ok,
    publicServerTime,
    timeoutMs,
  };
}
