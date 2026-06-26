import dns from "node:dns/promises";
import net from "node:net";
import process from "node:process";

const timeoutMs = 8000;
const targets = [
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

function summarizeError(error) {
  const parts = [];

  if (error instanceof Error && error.message) {
    parts.push(error.message);
  }

  if (error && typeof error === "object" && "code" in error && error.code) {
    parts.push(String(error.code));
  }

  if (error instanceof Error && error.cause && typeof error.cause === "object") {
    if ("code" in error.cause && error.cause.code) {
      parts.push(String(error.cause.code));
    }

    if (error.cause instanceof Error && error.cause.message) {
      parts.push(error.cause.message);
    }
  }

  return Array.from(new Set(parts)).join(" / ") || "unknown failure";
}

async function checkDns(hostname) {
  try {
    const addresses = await dns.lookup(hostname, { all: true });

    return {
      ok: addresses.length > 0,
      addressCount: addresses.length,
      families: Array.from(new Set(addresses.map((address) => address.family))).sort(),
    };
  } catch (error) {
    return {
      ok: false,
      error: summarizeError(error),
    };
  }
}

async function checkTcp443(hostname) {
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
        ok: false,
        port: 443,
        error: `TCP connection timed out after ${timeoutMs}ms`,
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

async function checkHttps(url) {
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
      ok: false,
      error: summarizeError(error),
    };
  }
}

const checks = [];

for (const target of targets) {
  const [dnsResult, tcp443, https] = await Promise.all([
    checkDns(target.hostname),
    checkTcp443(target.hostname),
    checkHttps(target.url),
  ]);

  checks.push({
    name: target.name,
    hostname: target.hostname,
    dns: dnsResult,
    tcp443,
    https,
  });
}

const allHttpsBlocked = checks.every(
  (check) => check.dns.ok && !check.tcp443.ok && !check.https.ok,
);
const result = {
  command: "diagnose:network",
  timeoutMs,
  status: allHttpsBlocked ? "blocked" : checks.every((check) => check.https.ok) ? "pass" : "warn",
  interpretation: allHttpsBlocked
    ? "DNS resolves, but outbound HTTPS/TCP 443 is blocked for multiple unrelated targets. Fix local firewall, VPN, proxy, endpoint protection, ISP, or sandbox network policy before exchange certification."
    : "Review per-target results. If only MEXC fails, investigate MEXC/IP/account restrictions. If several targets fail, investigate local outbound HTTPS.",
  checks,
  credentialValuesPrinted: false,
};

console.log(JSON.stringify(result, null, 2));

if (result.status !== "pass") {
  process.exit(1);
}
