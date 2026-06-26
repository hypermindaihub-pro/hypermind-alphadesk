# Lean MVP Plan

## Done In This MVP

- Normalize the Next.js app into the AlphaDesk root.
- Preserve `.env.local` and add `.env.example`.
- Add a full private dashboard route set.
- Add CoinGecko market data with cache, stale, and fallback labels.
- Add OpenAI agent reasoning with deterministic fallback and a four-role market/risk/execution/journal specialist workbench.
- Add Risk Manager approvals and vetoes.
- Add paper long/short P&L simulation.
- Add append-only journal helpers.
- Add cost controls and system health checks.
- Add server-only guarded MEXC live-order adapter.
- Add unit tests for safety-critical behavior.
- Add private browser persistence for local desk state.
- Add a real private access gate with an HttpOnly session cookie.
- Add encrypted desk vault export/import for private backup and recovery.
- Add encrypted browser autosave that removes the plaintext local copy and requires unlock on reload.
- Add exchange order, order-history, and spot wallet reconciliation with simulated snapshots by default and read-only MEXC Spot V3 polling when server credentials exist.
- Add read-only MEXC account diagnostics for spot account type, trading permission, credential readiness, and test-order/mainnet posture.
- Add launch-readiness snapshots that combine live guards, risk approval, account diagnostics, and reconciliation into a journal-recordable operator view.
- Add route-specific operator briefs so each workstation exposes its current next action, safety note, and live evidence.
- Add an HTTP/rendered-UI E2E validation gate for protected routes, critical UI affordances, agents, market data, paper trading, audit output, settings, cost control, system health, and a live-trading rejection matrix.
- Add a validated paper order ticket with notional/risk/reward preview, stop-direction validation, spot-short rejection, and journaled simulated execution.
- Add structured launch-readiness and account-diagnostics history that persists in browser storage and encrypted vault export/import.
- Add optional server-side sanitized JSONL audit logging for agent, paper ticket, and live-order guard routes when `ALPHADESK_AUDIT_LOG_DIR` is configured.
- Add dynamic forecast calibration from current ideas, closed paper positions, and veto/rejection journal evidence.
- Add E2E coverage for sanitized server audit JSONL writes and over-budget agent blocking.
- Add Playwright Chromium browser workflows for staging login, navigation, multi-agent reasoning, paper trading, journal/report review, live rejection probing, encrypted vault creation, diagnostics, health, and cost-control validation.
- Add `npm run validate:predeploy` as a sequential gate and `SCENARIO_COVERAGE.md` as the auditable validation matrix.

## Next Iteration

- Managed durable database/object storage for multi-user or serverless audit persistence.
- Role-based admin permissions.
- Scheduled or server-side historical calibration jobs beyond browser-local state.
- Server-side durable account-diagnostics and launch-readiness history if browser/vault storage is not enough.

## Not Included Yet

- Autonomous live trading.
- Portfolio syncing from a real exchange.
- Durable user accounts.
- Tax reporting.
