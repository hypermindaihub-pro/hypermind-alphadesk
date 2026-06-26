import { spawn } from "node:child_process";
import process from "node:process";

const safeEnv = {
  ...process.env,
  ALPHADESK_ACCESS_CODE: "alphadesk-browser-access",
  ALPHADESK_ADMIN_CODE: "alphadesk-browser-admin",
  ALPHADESK_AUTH_REQUIRED: "true",
  ALPHADESK_BROWSER_BASE_URL: "http://localhost:3117",
  ALPHADESK_BROWSER_PORT: "3117",
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
  ALPHADESK_AUDIT_LOG_DIR: "",
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: safeEnv,
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
await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test"]);
