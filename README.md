# Hypermind AlphaDesk

Hypermind AlphaDesk is a private AI crypto trading command center built with Next.js. It is designed for paper-first research, multi-agent reasoning, risk review, simulated long/short trading, audit logs, cost controls, safe server-only exchange integration, account diagnostics, order/position/wallet reconciliation, and launch-readiness snapshots.

The current UI is an interactive command-center workbench: routes open into functional watchlist, agent, trade idea, risk, paper-trading, journal, report, settings, health, and cost-control workstations rather than static documentation panels. Each route shows a live operator brief with next action, safety note, and evidence chips from the current desk state. The agent workstation runs a four-role specialist workbench for market analysis, risk review, execution coaching, and journal coaching while keeping all execution guarded. The paper-trading workstation includes a validated order ticket with notional, risk, reward, risk/reward preview, errors, warnings, and journaled paper execution. Reports compute forecast calibration from current ideas, closed paper positions, and veto/rejection journal evidence, including sample counts and Brier scores. Trade ideas, selected setup, paper positions, journal rows, launch-readiness history, and account-diagnostics history persist privately in browser storage, can be reset from Settings, can be exported/imported as an encrypted desk vault, and can use encrypted browser autosave so reloads require the user-held passphrase. Operators can record launch-readiness and account-diagnostics snapshots for audit review. Server routes can also append sanitized JSONL audit events when `ALPHADESK_AUDIT_LOG_DIR` is configured on a host with durable writable storage.

## Safety Defaults

- Paper trading is ON by default: `PAPER_TRADING_ENABLED=true`
- Live trading is OFF by default: `LIVE_TRADING_ENABLED=false`
- MEXC uses test-order mode by default: `MEXC_ORDER_TEST_MODE=true`
- Mainnet live trading is additionally blocked unless `ALLOW_MAINNET_LIVE_TRADING=true`
- Product live flags are OFF by default
- Launch readiness is advisory only and cannot enable live trading
- Operators choose Paper Trade or Live Trade per selected trade. Paper is selected by default.
- The live execution path rejects unless every guard passes:
  - `LIVE_TRADING_ENABLED=true`
  - admin permission passes
  - emergency stop is false
  - no-trade mode is false
  - MEXC credentials exist server-side
  - MEXC is in test-order mode, unless the explicit mainnet override is enabled
  - the product-specific live flag is enabled
  - Risk Manager approved the exact trade fingerprint
  - manual confirmation is provided

## Routes

The app includes `/`, `/login`, `/dashboard`, `/watchlist`, `/agents`, `/trade-ideas`, `/risk`, `/paper-trading`, `/journal`, `/reports`, `/settings`, `/system-health`, and `/cost-control`.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run validate:predeploy
```

`npm run validate:predeploy` runs lint, typecheck, unit tests, HTTP E2E, Playwright browser workflows, and a production build sequentially.

`npm run test:e2e` builds the app, starts local production servers with safe test-only environment values, logs in as trader and admin, and verifies protected routes, critical UI affordances, AI agent fallback plus the four-role specialist workbench, market data labels, a live-trading rejection matrix, valid and invalid paper order tickets, paper trading, sanitized server audit JSONL writes, structured history, dynamic forecast calibration, settings secret safety, over-budget agent blocking, cost control, and system health over HTTP. The live rejection matrix proves global live-off, missing credentials, non-admin session, missing manual confirmation, exact Risk Manager failure, product flag, emergency stop, and no-trade mode rejections through `/api/live-order`.

`npm run test:browser` builds the app with safe staging values, starts a local production server, and drives Chromium through login, route navigation, multi-agent reasoning, paper ticket submission, journal/report review, live rejection probing, encrypted vault creation, diagnostics, health, and cost-control workflows. It also checks agent response time stays under the browser-workflow budget.

`ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true npm run test:mexc-live` is the separate guarded MEXC live validation gate. It requires valid MEXC credentials in `.env.local`, forces non-secret safe flags, creates a small selected BTCUSDT spot trade, browser-validates paper execution, validates the same trade through MEXC `/api/v3/order/test` while `MEXC_ORDER_TEST_MODE=true`, and runs MEXC-backed reconciliation from sanitized evidence. Do not set `MEXC_ORDER_TEST_MODE=false` unless you intentionally want real MEXC mainnet order placement after a separate launch review.

`npm run diagnose:mexc` is a no-secret public connectivity preflight. It checks DNS resolution and the official MEXC Spot V3 public server-time endpoint at `https://api.mexc.com/api/v3/time` without printing API keys.

`ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true npm run diagnose:mexc-live` is a no-secret guarded eligibility probe for the same tiny BTCUSDT spot shape. It builds and starts AlphaDesk locally, logs in with a temporary admin code, and calls `/api/live-order` through the full server-side guard chain. With `MEXC_ORDER_TEST_MODE=true`, it validates through MEXC `/api/v3/order/test` without sending an order to the matching engine. This helps diagnose API key and pair permissions faster, but it does not replace the browser-level `test:mexc-live` completion gate.

If MEXC diagnostics show DNS OK but TCP 443 or server-time fetch failing with `EACCES`, use [MEXC_NETWORK_TROUBLESHOOTING.md](MEXC_NETWORK_TROUBLESHOOTING.md). AlphaDesk is not complete while that exchange reachability blocker remains.

See `SCENARIO_COVERAGE.md` for the requirement-by-requirement validation matrix.

See `VISION_REALIGNMENT.md` for the current product-alignment audit and remaining work.

## Environment

Copy `.env.example` to `.env.local` and fill in only the values you need. Do not commit `.env.local`. The app never needs secrets for local paper trading or build validation.

For private access, set `ALPHADESK_ACCESS_CODE` and `ALPHADESK_SESSION_SECRET`. Set `ALPHADESK_ADMIN_CODE` separately for admin sessions. The dashboard and API routes are protected by an HttpOnly session cookie when `ALPHADESK_AUTH_REQUIRED=true`; live execution uses the signed session role, not a client-supplied admin flag.

Encrypted vault backups and encrypted autosave use a user-provided passphrase in the browser. AlphaDesk does not store the passphrase. When encrypted autosave is enabled, the plaintext local desk copy is removed and reloads start locked until the passphrase is entered again.

`ALPHADESK_AUDIT_LOG_DIR` is optional. When set, its value is treated as a safe folder name under `data/alphadesk-audit/`, and server routes append sanitized JSONL audit events for agent reasoning, paper ticket execution/rejection, and live-order rejection/submission. Leave it blank on serverless hosts unless the platform provides durable writable storage.

## Data Providers

- CoinGecko: live crypto market data with one-minute cache, stale labels, and fallback data.
- OpenAI: server-side agent reasoning when `OPENAI_API_KEY` is configured; deterministic fallback otherwise. AlphaDesk splits each run into market analyst, risk manager, execution coach, and journal coach outputs.
- MEXC: server-only guarded Spot V3 adapter, test-order mode by default, with read-only account-info diagnostics, open-order/history polling, and spot wallet-balance polling when credentials are configured.

MEXC's official Spot V3 docs list `https://api.mexc.com` as the public REST endpoint and recommend protecting API keys with permissions, IP restrictions, and trading-pair settings. If public connectivity fails, MEXC validation cannot complete until network/DNS access is corrected.
