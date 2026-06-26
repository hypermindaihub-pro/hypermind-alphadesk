# Deployment

## Vercel

1. Push the project to a private repository.
2. Import the repo into Vercel as a Next.js app.
3. Add environment variables from `.env.example`.
4. Set `ALPHADESK_ACCESS_CODE`, `ALPHADESK_ADMIN_CODE`, and `ALPHADESK_SESSION_SECRET` to long private values.
5. Keep `LIVE_TRADING_ENABLED=false` unless you are intentionally testing the full live guard chain.
6. Keep `MEXC_ORDER_TEST_MODE=true` for all non-production exchange validation.
7. Keep `ALLOW_MAINNET_LIVE_TRADING=false` unless a separate real-capital launch review has approved mainnet.
8. Diagnostics and reconciliation can use MEXC credentials for read-only account-info, open-order, order-history, and wallet-balance polling; live execution still remains blocked by the live guard chain.
9. Use launch-readiness snapshots for operator review only. They summarize readiness and can be journaled, but they do not enable live trading or bypass the server-side live-order guard.
10. Leave `ALPHADESK_AUDIT_LOG_DIR` blank on Vercel unless you attach a durable writable storage target. On serverful hosts, set it to a safe folder name; AlphaDesk writes under `data/alphadesk-audit/<name>/`.

## Required Build Checks

Run these locally before deploying:

```bash
npm run validate:predeploy
```

`npm run validate:predeploy` runs lint, typecheck, unit tests, HTTP E2E, Playwright Chromium browser workflows, and a production build sequentially.

The E2E gate starts AlphaDesk with safe test-only environment values and verifies protected route rendering, critical UI affordances, AI agent fallback plus the four-role specialist workbench, market data freshness labels, valid and invalid paper order tickets, paper trading, journal/audit output, sanitized server audit JSONL writes, structured readiness/diagnostics history, dynamic forecast calibration, settings secret safety, over-budget agent blocking, cost control, system health, MEXC credential absence, and a live-order rejection matrix. The matrix proves global live-off, missing credentials, non-admin session, missing manual confirmation, exact Risk Manager failure, product flag, emergency stop, and no-trade mode rejections through `/api/live-order`. Do not deploy if this gate fails.

The browser gate uses Playwright Chromium against a production server with safe staging values. It validates click-level login, navigation, agent effectiveness/efficiency, paper trading, journal/report review, live rejection controls, vault creation, diagnostics, system health, and cost-control workflows. Do not deploy if this gate fails.

For the guarded MEXC live validation gate, configure valid MEXC credentials in `.env.local` without printing them, then run:

```bash
npm run diagnose:mexc
ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true npm run diagnose:mexc-live
ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true npm run test:mexc-live
```

The diagnostic command prints only public connectivity status and safe readiness booleans. The opt-in MEXC gate forces MEXC order-test mode, paper ON, live ON, spot live ON, derivatives live OFF, emergency stop OFF, no-trade mode OFF, and mainnet override OFF. It browser-validates a small selected BTCUSDT spot trade through Paper Trade, validates the same selected trade through guarded MEXC `/api/v3/order/test`, and reconciles sanitized evidence against MEXC read-only order polling.

`diagnose:mexc-live` is an optional faster eligibility probe. It uses the same safe order-test flags and guarded `/api/live-order` path. Passing that command is useful, but deployment for the expanded goal still requires the browser-level `test:mexc-live` gate. Set `MEXC_ORDER_TEST_MODE=false` and `ALLOW_MAINNET_LIVE_TRADING=true` only when intentionally placing real MEXC mainnet orders after a separate launch review.

See `SCENARIO_COVERAGE.md` for the full validation matrix and known non-completion items.

## Secret Safety

Do not paste secrets into chat, docs, screenshots, logs, or client components. Use Vercel environment variables for `OPENAI_API_KEY`, `MEXC_API_KEY`, and `MEXC_API_SECRET`.
Also keep `ALPHADESK_ACCESS_CODE`, `ALPHADESK_ADMIN_CODE`, and `ALPHADESK_SESSION_SECRET` server-side only.

Encrypted desk vault backups and encrypted browser autosave are protected by a user-held passphrase in the browser. The passphrase is not an environment variable and should not be stored in Vercel, logs, docs, or screenshots.

When `ALPHADESK_AUDIT_LOG_DIR` is configured, AlphaDesk writes sanitized JSONL events only. It records route, event, actor, summary, and primitive metadata; it does not write API keys, session secrets, or request bodies.

## Production Hardening Before Real Capital

- Expand the current access-code gate into full account-based authentication with granular role permissions.
- Replace local JSONL audit storage with a managed durable database or object store if multi-user or serverless durability is required.
- Add alerting for emergency stop, product flags, and live trading state.
- Expand browser workflow coverage as new operator flows are added.
- Review the live order adapter with a second engineer before enabling mainnet credentials.
