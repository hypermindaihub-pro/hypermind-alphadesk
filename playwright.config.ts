import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.ALPHADESK_BROWSER_PORT ?? 3117);
const baseURL =
  process.env.ALPHADESK_BROWSER_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [["list"]],
  testDir: "./tests/browser",
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `${JSON.stringify(process.execPath)} scripts/start-browser-server.mjs`,
    reuseExistingServer: false,
    timeout: 90_000,
    url: `${baseURL}/login`,
  },
});
