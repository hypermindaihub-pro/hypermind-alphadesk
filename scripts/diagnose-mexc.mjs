import dns from "node:dns/promises";
import net from "node:net";
import process from "node:process";

const endpoint = "https://api.mexc.com";
const hostname = "api.mexc.com";
const timeoutMs = Number(process.env.MEXC_REQUEST_TIMEOUT_MS ?? 8000);

function boundedTimeoutMs(value) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 30000) : 8000;
}

function summarizeError(error) {
  const messages = [];

  if (error instanceof Error && error.message) {
    messages.push(error.message);
  }

  if (typeof error?.code === "string") {
    messages.push(typeof error.hostname === "string" ? `${error.code} ${error.hostname}` : error.code);
  }

  if (error?.cause instanceof Error && error.cause.message) {
    messages.push(error.cause.message);
  }

  if (typeof error?.cause?.code === "string") {
    messages.push(
      typeof error.cause.hostname === "string"
        ? `${error.cause.code} ${error.cause.hostname}`
        : error.cause.code,
    );
  }

  return Array.from(new Set(messages)).join(" / ") || "unknown failure";
}

async function checkDns() {
  try {
    const addresses = await dns.lookup(hostname, { all: true });

    return {
      ok: addresses.length > 0,
      addresses: addresses.map((address) => ({
        address: address.address,
        family: address.family,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error: summarizeError(error),
    };
  }
}

async function checkServerTime() {
  const timeout = boundedTimeoutMs(timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`MEXC public request timed out after ${timeout}ms`));
  }, timeout);

  try {
    const response = await fetch(`${endpoint}/api/v3/time`, {
      method: "GET",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));

    return {
      ok: response.ok && typeof payload.serverTime === "number",
      httpStatus: response.status,
      serverTimePresent: typeof payload.serverTime === "number",
    };
  } catch (error) {
    return {
      ok: false,
      error: summarizeError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkTcp443() {
  const timeout = boundedTimeoutMs(timeoutMs);

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: hostname,
      port: 443,
      timeout,
    });

    socket.once("connect", () => {
      socket.destroy();
      resolve({ ok: true, port: 443 });
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve({
        ok: false,
        port: 443,
        error: `TCP connection timed out after ${timeout}ms`,
      });
    });

    socket.once("error", (error) => {
      socket.destroy();
      resolve({
        ok: false,
        port: 443,
        error: summarizeError(error),
      });
    });
  });
}

function classifyMexcDiagnostic(dnsResult, tcp443, publicTime) {
  if (!dnsResult.ok || !tcp443.ok || !publicTime.ok) {
    return {
      category: "network",
      credentialFailure: false,
      exchangeRejection: false,
      label: "MEXC network reachability failure",
      networkFailure: true,
      permissionFailure: false,
      unknownFailure: false,
    };
  }

  return {
    category: "none",
    credentialFailure: false,
    exchangeRejection: false,
    label: "MEXC public diagnostics passed",
    networkFailure: false,
    permissionFailure: false,
    unknownFailure: false,
  };
}

const dnsResult = await checkDns();
const tcp443 = await checkTcp443();
const publicTime = await checkServerTime();
const diagnostic = classifyMexcDiagnostic(dnsResult, tcp443, publicTime);
const result = {
  endpoint,
  hostname,
  timeoutMs: boundedTimeoutMs(timeoutMs),
  dns: dnsResult,
  tcp443,
  publicServerTime: publicTime,
  diagnostic,
  signedCredentialChecks:
    diagnostic.category === "none"
      ? "not checked by diagnose:mexc; run ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true npm run diagnose:mexc-live"
      : "skipped until public network diagnostics pass",
  mexcCredentialValuesPrinted: false,
  note: "MEXC Spot V3 docs list this as the public REST endpoint. This check uses only public DNS and server-time data.",
};

console.log(JSON.stringify(result, null, 2));

if (!dnsResult.ok || !tcp443.ok || !publicTime.ok) {
  process.exit(1);
}
