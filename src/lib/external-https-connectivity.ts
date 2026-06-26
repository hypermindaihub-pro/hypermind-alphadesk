import "server-only";

import dns from "node:dns/promises";
import net from "node:net";
import { summarizeError } from "./error-summary";

export type ExternalHttpsTargetStatus = {
  name: string;
  hostname: string;
  dns: {
    ok: boolean;
    addressCount: number;
    families: number[];
    error?: string;
  };
  tcp443: {
    ok: boolean;
    port: 443;
    error?: string;
  };
  https: {
    ok: boolean;
    status?: number;
    error?: string;
  };
};

export type ExternalHttpsConnectivity = {
  checkedAt: string;
  status: "pass" | "warn" | "blocked";
  globalNetworkEacces: boolean;
  lastSanitizedError?: string;
  targets: ExternalHttpsTargetStatus[];
};

const DEFAULT_TIMEOUT_MS = 8000;
const TARGETS = [
  {
    name: "MEXC Spot API",
    hostname: "api.mexc.com",
    url: "https://api.mexc.com/api/v3/time",
  },
  {
    name: "CoinGecko API",
    hostname: "api.coingecko.com",
    url: "https://api.coingecko.com/api/v3/ping",
  },
  {
    name: "Generic HTTPS",
    hostname: "example.com",
    url: "https://example.com",
  },
];

function compactError(error: unknown, fallback: string): string {
  const summary = summarizeError(error, fallback);

  return summary.replace(/\s+/g, " ").trim();
}

async function checkDns(hostname: string): Promise<ExternalHttpsTargetStatus["dns"]> {
  try {
    const addresses = await dns.lookup(hostname, { all: true });

    return {
      addressCount: addresses.length,
      families: Array.from(new Set(addresses.map((address) => address.family))).sort(),
      ok: addresses.length > 0,
    };
  } catch (error) {
    return {
      addressCount: 0,
      error: compactError(error, "DNS lookup failed."),
      families: [],
      ok: false,
    };
  }
}

async function checkTcp443(
  hostname: string,
  timeoutMs: number,
): Promise<ExternalHttpsTargetStatus["tcp443"]> {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: hostname,
      port: 443,
      timeout: timeoutMs,
    });

    socket.once("connect", () => {
      socket.destroy();
      resolve({ ok: true, port: 443 });
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve({
        error: `TCP connection timed out after ${timeoutMs}ms`,
        ok: false,
        port: 443,
      });
    });

    socket.once("error", (error) => {
      socket.destroy();
      resolve({
        error: compactError(error, "TCP 443 connection failed."),
        ok: false,
        port: 443,
      });
    });
  });
}

async function checkHttps(
  url: string,
  timeoutMs: number,
): Promise<ExternalHttpsTargetStatus["https"]> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      error: compactError(error, "HTTPS fetch failed."),
      ok: false,
    };
  }
}

export async function checkExternalHttpsConnectivity(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ExternalHttpsConnectivity> {
  const targets = await Promise.all(
    TARGETS.map(async (target) => {
      const [dnsStatus, tcp443, https] = await Promise.all([
        checkDns(target.hostname),
        checkTcp443(target.hostname, timeoutMs),
        checkHttps(target.url, timeoutMs),
      ]);

      return {
        dns: dnsStatus,
        hostname: target.hostname,
        https,
        name: target.name,
        tcp443,
      };
    }),
  );
  const allHttpsBlocked = targets.every(
    (target) => target.dns.ok && !target.tcp443.ok && !target.https.ok,
  );
  const allPass = targets.every((target) => target.https.ok);
  const lastErrorTarget = targets.find(
    (target) => target.tcp443.error || target.https.error || target.dns.error,
  );

  return {
    checkedAt: new Date().toISOString(),
    globalNetworkEacces:
      allHttpsBlocked &&
      targets.every((target) =>
        `${target.tcp443.error ?? ""} ${target.https.error ?? ""}`
          .toLowerCase()
          .includes("eacces"),
      ),
    lastSanitizedError:
      lastErrorTarget?.tcp443.error ??
      lastErrorTarget?.https.error ??
      lastErrorTarget?.dns.error,
    status: allPass ? "pass" : allHttpsBlocked ? "blocked" : "warn",
    targets,
  };
}
