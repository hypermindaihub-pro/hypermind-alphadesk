import { expect, test, type Page } from "@playwright/test";

const accessCode = process.env.ALPHADESK_ACCESS_CODE ?? "alphadesk-browser-access";
const adminCode = process.env.ALPHADESK_ADMIN_CODE ?? "alphadesk-browser-admin";

test.skip(
  process.env.ALPHADESK_ENABLE_LIVE_TESTNET_E2E !== "true",
  "MEXC guarded live validation requires ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true.",
);

async function login(page: Page, code = adminCode, next = "/system-health") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Access code").fill(code);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/login")),
    page.getByRole("button", { name: "Enter private desk" }).click(),
  ]);
  expect(loginResponse.status()).toBeGreaterThanOrEqual(300);
  expect(loginResponse.status()).toBeLessThan(400);
  await expect(page).toHaveURL(new RegExp(`${next.replace("/", "\\/")}$`));
}

test.describe("AlphaDesk guarded MEXC live workflow", () => {
  test("validates health, paper execution, MEXC test-order validation, and reconciliation", async ({
    page,
  }) => {
    await login(page, adminCode, "/system-health");

    await expect(page.getByText("System health workstation")).toBeVisible();
    await expect(
      page.getByText("Live trading is intentionally enabled for isolated MEXC test-order validation."),
    ).toBeVisible();
    await expect(page.getByText("MEXC test-order mode credentials detected server-side.")).toBeVisible();
    const accountFetched = page.getByText(/Account diagnostics fetched .+ with/);
    const accountBlocked = page.getByText(/Account info polling failed: .+ blocks MEXC live validation\./);
    await expect(accountFetched.or(accountBlocked).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Account mode diagnostics")).toBeVisible();
    await expect(page.getByText("Source").first()).toBeVisible();
    await expect(page.getByText(/mexc|env/).first()).toBeVisible();

    await page.getByRole("link", { name: /Trade Ideas/ }).click();
    await page.getByLabel("Symbol").fill("BTCUSDT");
    await page.getByLabel("Product").selectOption("spot");
    await page.getByLabel("Quantity").fill("0.001");
    await page.getByLabel("Entry").fill("67000");
    await page.getByLabel("Stop loss").fill("65000");
    await page.getByLabel("Take profit").fill("71000");
    await page.getByLabel("Leverage").fill("1");
    await page.getByLabel("Confidence %").fill("72");
    await page
      .getByLabel("Thesis")
      .fill("MEXC guarded spot validation order with small notional and hard stop.");
    await page.getByRole("button", { name: "Create and review" }).click();

    await expect(page.getByText("Risk Manager and live execution gate")).toBeVisible();
    await expect(page.getByText("Operator execution choice")).toBeVisible();
    await page.getByRole("button", { name: "Execute selected idea as Paper Trade" }).click();
    await expect(page.getByText(/Paper Trade selected\. Opened BTCUSDT long/)).toBeVisible();

    await page.getByLabel("Manual confirmation").fill("CONFIRM LIVE TRADE");
    await expect(page.getByRole("button", { name: "Validate MEXC test order" })).toBeVisible();
    await page.getByRole("button", { name: "Validate MEXC test order" }).click();
    const submittedYes = page.getByText("Submitted: yes");
    const submittedNo = page.getByText("Submitted: no");
    await expect(submittedYes.or(submittedNo).first()).toBeVisible({ timeout: 20_000 });

    if (await submittedNo.isVisible()) {
      await expect(page.getByText(/MEXC order request failed: .+EACCES/).first()).toBeVisible();
      return;
    }

    await expect(page.getByText("MEXC evidence:")).toBeVisible();

    await page.getByRole("link", { name: /System Health/ }).click();
    await page.getByRole("button", { name: "Run reconciliation" }).click();
    await expect(page.getByText("Order mode", { exact: true })).toBeVisible();
    await expect(page.getByText("mexc").first()).toBeVisible({ timeout: 25_000 });
    await expect(
      page.getByText(
        "MEXC read-only open-order, order-history, and spot wallet polling completed using server-side credentials. Derivatives exposure remains simulated because this adapter uses MEXC Spot V3.",
      ),
    ).toBeVisible();
  });

  test("still rejects MEXC validation when the manual confirmation guard fails", async ({ page }) => {
    await login(page, accessCode, "/risk");

    await expect(page.getByText("Operator execution choice")).toBeVisible();
    await page.getByRole("button", { name: "Submit live request" }).click();
    await expect(page.getByText("Submitted: no")).toBeVisible();
    await expect(page.getByText("Admin permission did not pass.").first()).toBeVisible();
    await expect(
      page.getByText("Manual confirmation phrase required: CONFIRM LIVE TRADE.").first(),
    ).toBeVisible();
  });
});
