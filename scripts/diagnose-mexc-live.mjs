import { spawn } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import process from "node:process";

if (process.env.ALPHADESK_ENABLE_LIVE_TESTNET_E2E !== "true") {
  console.error(
    "Set ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true to run the guarded MEXC live eligibility diagnostic.",
  );
  process.exit(1);
}

if (!fs.existsSync(".env.local")) {
  console.error(".env.local is required for MEXC live eligibility diagnostics.");
  process.exit(1);
}

const host = "127.0.0.1";
const port = process.env.ALPHADESK_LIVE_DIAGNOSTIC_PORT ?? "3137";
const baseUrl = `http://${host}:${port}`;
const mexcEndpoint = "https://api.mexc.com";
const mexcHostname = "api.mexc.com";
const adminCode = "alphadesk-live-diagnostic-admin";
const sessionSecret = "alphadesk-live-diagnostic-session-secret-with-enough-length";
const manualConfirmation = "CONFIRM LIVE TRADE";
let server;
let serverOutput = "";

const liveDiagnosticEnv = {
  ...process.env,
  ALPHADESK_ACCESS_CODE: "alphadesk-live-diagnostic-access",
  ALPHADESK_ADMIN_CODE: adminCode,
  ALPHADESK_AUTH_REQUIRED: "true",
  ALPHADESK_ENABLE_LIVE_TESTNET_E2E: "true",
  ALPHADESK_SESSION_SECRET: sessionSecret,
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      host: mexcHostname,
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
    const addresses = await dns.lookup(mexcHostname, { all: true });
    const response = await fetch(`${mexcEndpoint}/api/v3/time`, {
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

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: liveDiagnosticEnv,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let output = "";

    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}\n${output}`));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  let lastError = "server did not respond";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });

      if (response.status === 200) {
        return;
      }

      lastError = `unexpected /login status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for AlphaDesk diagnostic server: ${lastError}\n${serverOutput}`,
  );
}

async function startServer() {
  serverOutput = "";
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      host,
      "--port",
      port,
    ],
    {
      env: liveDiagnosticEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  await waitForServer();
}

async function stopServer() {
  if (!server || server.killed) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2_500);
    server.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    server.kill();
  });
}

async function login() {
  const form = new URLSearchParams();

  form.set("access_code", adminCode);
  form.set("next", "/system-health");

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    body: form,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];

  if (response.status < 300 || response.status >= 400 || !cookie) {
    throw new Error(`Diagnostic login failed with HTTP ${response.status}.`);
  }

  return cookie;
}

async function postLiveOrder(cookie) {
  const response = await fetch(`${baseUrl}/api/live-order`, {
    body: JSON.stringify({
      symbol: "BTCUSDT",
      side: "long",
      product: "spot",
      quantity: 0.001,
      entryPrice: 67000,
      stopLoss: 65000,
      takeProfit: 71000,
      leverage: 1,
      confidence: 0.72,
      thesis: "MEXC guarded live validation with small spot notional and hard stop.",
      manualConfirmation,
    }),
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  return { payload, status: response.status };
}

try {
  const preflight = await checkMexcPublicPreflight();

  if (!preflight.ok) {
    console.error(
      JSON.stringify(
        {
          command: "diagnose:mexc-live",
          submitted: false,
          exchange: "mexc",
          testnet: true,
          diagnostic: {
            category: "network",
            label: "Exchange network reachability issue",
            operatorAction:
              "Resolve local network, firewall, VPN, IP restriction, or exchange reachability before retrying guarded MEXC live validation.",
          },
          endpoint: mexcEndpoint,
          dns: preflight.dns,
          tcp443: preflight.tcp443,
          publicServerTime: preflight.publicServerTime,
          reasons: ["MEXC public endpoint is unreachable from this machine."],
          orderEvidence: null,
          mexcCredentialValuesPrinted: false,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  await run(process.execPath, ["node_modules/next/dist/bin/next", "build"]);
  await startServer();
  const cookie = await login();
  const result = await postLiveOrder(cookie);
  const summary = {
    command: "diagnose:mexc-live",
    submitted: result.payload.submitted === true,
    httpStatus: result.status,
    exchange: result.payload.exchange ?? null,
    testnet: result.payload.testnet ?? null,
    sessionRole: result.payload.sessionRole ?? null,
    riskApproved: result.payload.riskApproved ?? null,
    diagnostic: result.payload.diagnostic ?? null,
    reasons: Array.isArray(result.payload.reasons) ? result.payload.reasons : [],
    orderEvidence: result.payload.order
      ? {
          orderIdPresent: Boolean(result.payload.order.orderId),
          orderLinkIdPresent: Boolean(result.payload.order.orderLinkId),
          retCode: result.payload.order.retCode,
          retMsg: result.payload.order.retMsg,
        }
      : null,
    mexcCredentialValuesPrinted: false,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.submitted) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        command: "diagnose:mexc-live",
        exchange: "mexc",
        submitted: false,
        error: error instanceof Error ? error.message : String(error),
        mexcCredentialValuesPrinted: false,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await stopServer();
}
