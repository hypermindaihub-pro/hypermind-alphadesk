import { spawn } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import process from "node:process";

const MEXC_ENDPOINT = "https://api.mexc.com";
const MEXC_HOSTNAME = "api.mexc.com";

if (process.env.ALPHADESK_ENABLE_LIVE_TESTNET_E2E !== "true") {
  console.error(
    "Set ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true to run the MEXC guarded live-order browser workflow.",
  );
  process.exit(1);
}

if (!fs.existsSync(".env.local")) {
  console.error(".env.local is required for MEXC live validation.");
  process.exit(1);
}

const liveTestnetEnv = {
  ...process.env,
  ALPHADESK_ACCESS_CODE: "alphadesk-browser-access",
  ALPHADESK_ADMIN_CODE: "alphadesk-browser-admin",
  ALPHADESK_AUTH_REQUIRED: "true",
  ALPHADESK_BROWSER_BASE_URL: "http://localhost:3127",
  ALPHADESK_BROWSER_PORT: "3127",
  ALPHADESK_ENABLE_LIVE_TESTNET_E2E: "true",
  ALPHADESK_SESSION_SECRET: "alphadesk-browser-session-secret-with-enough-length",
  ALLOW_MAINNET_LIVE_TRADING: "false",
  MEXC_ORDER_TEST_MODE: "true",
  EMERGENCY_STOP: "false",
  LIVE_TRADING_ENABLED: "true",
  NEXT_TELEMETRY_DISABLED: "1",
  NO_TRADE_MODE: "false",
  PAPER_TRADING_ENABLED: "true",
  PRODUCT_DERIVATIVES_LIVE_ENABLED: "false",
  PRODUCT_SPOT_LIVE_ENABLED: "true",
};

function summarizeError(error) {
  if (!error) {
    return "unknown error";
  }

  const message = error instanceof Error ? error.message : String(error);
  const parts = message ? [message] : [];

  if (error instanceof Error && "code" in error && error.code) {
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

  return parts.join(" / ").replace(/\s+/g, " ").trim();
}

async function checkMexcPublicPreflight() {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("MEXC public preflight timed out."));
  }, 8000);
  const tcp443 = await new Promise((resolve) => {
    const socket = net.createConnection({
      host: MEXC_HOSTNAME,
      port: 443,
      timeout: 8000,
    });

    socket.once("connect", () => {
      socket.destroy();
      resolve({ ok: true, port: 443 });
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve({ ok: false, port: 443, error: "TCP connection timed out after 8000ms" });
    });

    socket.once("error", (error) => {
      socket.destroy();
      resolve({ ok: false, port: 443, error: summarizeError(error) });
    });
  });

  try {
    const addresses = await dns.lookup(MEXC_HOSTNAME, { all: true });
    const response = await fetch(`${MEXC_ENDPOINT}/api/v3/time`, {
      signal: controller.signal,
    });

    return {
      ok: response.ok && tcp443.ok,
      dns: {
        ok: addresses.length > 0,
        addressCount: addresses.length,
      },
      tcp443,
      publicServerTime: {
        ok: response.ok,
        status: response.status,
      },
    };
  } catch (error) {
    return {
      ok: false,
      dns: {
        ok: true,
        addressCount: null,
      },
      tcp443,
      publicServerTime: {
        ok: false,
        error: summarizeError(error),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

const preflight = await checkMexcPublicPreflight();

if (!preflight.ok) {
  console.error(JSON.stringify(
    {
      command: "test:mexc-live",
      mexcExecutionCertified: "blocked",
      category: "network",
      label: "MEXC public endpoint is unreachable from this machine.",
      endpoint: MEXC_ENDPOINT,
      dns: preflight.dns,
      tcp443: preflight.tcp443,
      publicServerTime: preflight.publicServerTime,
      operatorAction:
        "Resolve local network, firewall, VPN, IP restriction, or exchange reachability before rerunning the guarded browser certification workflow.",
      mexcCredentialValuesPrinted: false,
    },
    null,
    2,
  ));
  process.exit(1);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: liveTestnetEnv,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

await run(process.execPath, ["node_modules/next/dist/bin/next", "build"]);
await run(process.execPath, [
  "node_modules/@playwright/test/cli.js",
  "test",
  "tests/browser/mexc-live.spec.ts",
  "--reporter=line",
  "--workers=1",
]);
