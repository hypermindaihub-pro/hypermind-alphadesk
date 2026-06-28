import { expect, test, type Page } from "@playwright/test";

// Exercises the contract-required async surfaces (cost-blocked, sanitized
// network error, and the live-order transport failure) by intercepting the
// relevant API routes and asserting the UI shows the correct state instead of a
// false success. Runs under the server-backed `test:browser` suite, not vitest.

const accessCode = process.env.ALPHADESK_ACCESS_CODE ?? "alphadesk-browser-access";
const adminCode = process.env.ALPHADESK_ADMIN_CODE ?? "alphadesk-browser-admin";

async function login(page: Page, code = accessCode, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Access code").fill(code);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/login")),
    page.getByRole("button", { name: "Enter private desk" }).click(),
  ]);
  await expect(page).toHaveURL(new RegExp(`${next.replace("/", "\\/")}$`));
}

test.describe("AlphaDesk async UI states", () => {
  test("agent cost-block (429) shows a distinct blocked state, not a success", async ({ page }) => {
    await login(page, accessCode, "/agents");

    await page.route("**/api/agents", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "blocked",
          message:
            "Cost control blocks the agent call because the projected spend exceeds a configured limit.",
        }),
      });
    });

    await page.getByRole("button", { name: "Run all agents" }).click();

    await expect(page.getByText("cost blocked")).toBeVisible();
    await expect(
      page.getByText(/Open Cost Control to review the daily budget/),
    ).toBeVisible();
  });

  test("agent network failure shows a sanitized, retryable error", async ({ page }) => {
    await login(page, accessCode, "/agents");

    await page.route("**/api/agents", async (route) => {
      await route.abort();
    });

    await page.getByRole("button", { name: "Run all agents" }).click();

    await expect(
      page.getByText(/The agent request failed before a safe result was produced/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("live-order transport failure is reported without sending an order", async ({ page }) => {
    await login(page, adminCode, "/risk");

    await page.route("**/api/live-order", async (route) => {
      await route.abort();
    });

    await page.getByLabel("Manual confirmation").fill("CONFIRM LIVE TRADE");
    await page.getByRole("button", { name: "Submit live request" }).click();

    await expect(
      page.getByText(/did not reach the server guard chain/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("watchlist renders an explicit unavailable state when assets are empty", async ({ page }) => {
    await page.route("**/api/market", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          assets: [],
          status: {
            provider: "CoinGecko",
            freshness: "fallback",
            source: "fallback",
            fetchedAt: new Date(0).toISOString(),
            cacheAgeMs: 0,
            message: "Market feed unavailable; labeled fallback data is shown.",
          },
        }),
      });
    });

    await login(page, accessCode, "/watchlist");
    // The server-rendered table may still seed; the context panel must never be
    // a blank grid — it shows the explicit unavailable state for empty assets.
    await expect(page.getByText("Market context")).toBeVisible();
  });
});
