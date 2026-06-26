import { expect, test, type Page } from "@playwright/test";

const accessCode = process.env.ALPHADESK_ACCESS_CODE ?? "alphadesk-browser-access";
const adminCode = process.env.ALPHADESK_ADMIN_CODE ?? "alphadesk-browser-admin";

async function login(page: Page, code = accessCode, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Access code").fill(code);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/login")),
    page.getByRole("button", { name: "Enter private desk" }).click(),
  ]);
  expect(loginResponse.status()).toBeGreaterThanOrEqual(300);
  expect(loginResponse.status()).toBeLessThan(400);
  await page.waitForTimeout(500);
  const cookieMetadata = (await page.context().cookies()).map((cookie) => ({
    domain: cookie.domain,
    name: cookie.name,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
  }));
  expect(cookieMetadata).toContainEqual(
    expect.objectContaining({ name: "alphadesk_session" }),
  );
  await expect(page).toHaveURL(new RegExp(`${next.replace("/", "\\/")}$`));
  await expect
    .poll(async () =>
      (await page.context().cookies()).some((cookie) => cookie.name === "alphadesk_session"),
    )
    .toBe(true);
  await expect(page.getByText("Paper trading ON")).toBeVisible();
  await expect(page.getByText("Live trading OFF")).toBeVisible();
}

test.describe("AlphaDesk browser workflows", () => {
  test("private login and route navigation behave like a protected command center", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);

    await login(page);
    await expect(page.getByText("Mission control workstation")).toBeVisible();
    await page.getByRole("link", { name: "Agents" }).click();
    await expect(page).toHaveURL(/\/agents$/);
    await expect(page.getByText("Agent reasoning workstation")).toBeVisible();
    await page.getByRole("link", { name: /Paper Trading/ }).click();
    await expect(page).toHaveURL(/\/paper-trading$/);
    await expect(page.getByText("Paper execution workstation")).toBeVisible();
  });

  test("agents produce useful specialist output efficiently", async ({ page }) => {
    await login(page, accessCode, "/agents");

    const startedAt = Date.now();
    await page.getByRole("button", { name: "Run agent reasoning" }).click();
    await expect(page.getByText("Specialist workbench")).toBeVisible();
    await expect(page.getByText("Market analyst")).toBeVisible();
    await expect(page.getByText("Risk manager agent")).toBeVisible();
    await expect(page.getByText("Execution coach", { exact: true })).toBeVisible();
    await expect(page.getByText("Journal coach", { exact: true })).toBeVisible();
    await expect(page.getByText("4 agents")).toBeVisible();
    await expect(page.getByText("deterministic-fallback")).toBeVisible();

    const durationMs = Date.now() - startedAt;
    expect(durationMs).toBeLessThan(10_000);
    await expect(page.getByText("Cost preflight")).toBeVisible();
    await expect(page.getByText("Agent call is inside the daily budget.")).toBeVisible();
  });

  test("paper ticket, audit journal, and reports update from browser actions", async ({ page }) => {
    await login(page, accessCode, "/paper-trading");

    await expect(page.getByText("Operator execution choice")).toBeVisible();
    await expect(page.getByText("Paper selected")).toBeVisible();
    await page.getByRole("button", { name: "Sync selected idea" }).click();
    await expect(page.getByText("ticket valid")).toBeVisible();
    await page.getByRole("button", { name: "Submit paper ticket" }).click();
    await expect(page.getByText(/Opened paper ticket ETHUSDT/).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "ETHUSDT" }).first()).toBeVisible();

    await page.getByRole("link", { name: /Journal/ }).click();
    await expect(page.getByText("paper-ticket-open")).toBeVisible();
    await expect(page.getByText(/Opened paper ticket ETHUSDT long/i)).toBeVisible();

    await page.getByRole("link", { name: /Reports/ }).click();
    await expect(page.getByText("Reporting workstation")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agent direction calls" })).toBeVisible();
    await expect(page.getByText("Brier").first()).toBeVisible();
  });

  test("live rejection probe is blocked in the browser with admin session", async ({ page }) => {
    await login(page, adminCode, "/risk");

    await expect(page.getByText("Operator execution choice")).toBeVisible();
    await expect(page.getByRole("button", { name: "Execute selected idea as Paper Trade" })).toBeVisible();
    await page.getByLabel("Manual confirmation").fill("CONFIRM LIVE TRADE");
    await page.getByRole("button", { name: "Submit live request" }).click();
    await expect(page.getByText("Submitted: no")).toBeVisible();
    await expect(page.getByText("LIVE_TRADING_ENABLED is not true.").first()).toBeVisible();
    await expect(
      page.getByText("MEXC API credentials are not configured server-side.").first(),
    ).toBeVisible();
  });

  test("settings, vault, diagnostics, health, and cost-control workflows are operable", async ({ page }) => {
    await login(page, accessCode, "/settings");

    await page.getByLabel("Vault passphrase").fill("browser-test-passphrase");
    await page.getByRole("button", { name: "Create vault" }).click();
    await expect(page.getByLabel("Encrypted vault JSON")).toHaveValue(
      /hypermind\.alphadesk\.encrypted-vault/,
    );
    await expect(page.getByText("Encrypted vault created.")).toBeVisible();
    await page.getByRole("button", { name: "Record diagnostics" }).click();
    await page.getByRole("link", { name: /Journal/ }).click();
    await expect(page.getByText(/Account diagnostics snapshot recorded/)).toBeVisible();

    await page.getByRole("link", { name: /System Health/ }).click();
    await expect(page.getByText("System health workstation")).toBeVisible();
    await expect(page.getByText("Paper trading is ON by default.")).toBeVisible();
    await expect(page.getByText("Live trading is OFF by default.", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: /Cost Control/ }).click();
    await expect(page.getByText("Cost control workstation")).toBeVisible();
    await expect(page.getByLabel("Projected agent calls")).toBeVisible();
    await expect(page.getByText("within budget", { exact: true })).toBeVisible();
  });
});
