import { spawn } from "node:child_process";
import process from "node:process";

const port = process.env.ALPHADESK_BROWSER_PORT ?? "3117";
const liveTestnetE2E = process.env.ALPHADESK_ENABLE_LIVE_TESTNET_E2E === "true";
const safeEnv = liveTestnetE2E ? {
  ...process.env,
  ALPHADESK_ACCESS_CODE: "alphadesk-browser-access",
  ALPHADESK_ADMIN_CODE: "alphadesk-browser-admin",
  ALPHADESK_AUDIT_LOG_DIR: "",
  ALPHADESK_AUTH_REQUIRED: "true",
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
} : {
  ...process.env,
  ALPHADESK_ACCESS_CODE: "alphadesk-browser-access",
  ALPHADESK_ADMIN_CODE: "alphadesk-browser-admin",
  ALPHADESK_AUDIT_LOG_DIR: "",
  ALPHADESK_AUTH_REQUIRED: "true",
  ALPHADESK_SESSION_SECRET: "alphadesk-browser-session-secret-with-enough-length",
  MEXC_API_KEY: "",
  MEXC_API_SECRET: "",
  MEXC_ORDER_TEST_MODE: "true",
  EMERGENCY_STOP: "false",
  LIVE_TRADING_ENABLED: "false",
  NEXT_TELEMETRY_DISABLED: "1",
  NO_TRADE_MODE: "false",
  OPENAI_API_KEY: "",
  PAPER_TRADING_ENABLED: "true",
  PRODUCT_DERIVATIVES_LIVE_ENABLED: "false",
  PRODUCT_SPOT_LIVE_ENABLED: "false",
};

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "localhost", "--port", port],
  {
    env: safeEnv,
    stdio: "inherit",
    windowsHide: true,
  },
);

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (!server.killed) {
    server.kill(signal);
  }

  setTimeout(() => {
    process.exit(signal === "SIGTERM" ? 0 : 1);
  }, 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 0 : 1));
});
