# Scenario Coverage Matrix

AlphaDesk is not deployment-ready unless these gates pass together:

```bash
npm run validate:predeploy
```

That command runs lint, typecheck, unit tests, HTTP E2E, Playwright Chromium browser workflows, and a final production build sequentially so Next build locks do not collide.

For the expanded MEXC live validation bar, the following credential-dependent gate must also pass after valid MEXC credentials are present in `.env.local`:

```bash
npm run diagnose:mexc
ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true npm run diagnose:mexc-live
ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true npm run test:mexc-live
```

## Validated Scenarios

| Area | Evidence | What Is Proven |
| --- | --- | --- |
| Private access and staging browser auth | `npm run test:browser` | A real Chromium browser can log in against a production server using safe staging values, receive an HttpOnly session cookie, and navigate protected routes. |
| Agent effectiveness | `src/lib/__tests__/agent-workbench.test.ts`, `npm run test:e2e`, `npm run test:browser` | Agent runs produce four specialist roles: market analyst, Risk Manager, execution coach, and journal coach. Each role returns actionable bullets, a next action, and a safety note without leaking secrets. |
| Agent efficiency | `tests/browser/alphadesk-workflows.spec.ts` | Browser workflow requires the agent run to finish within the configured 10 second interaction budget under deterministic fallback/staging conditions. |
| Cost control | `npm run test:e2e`, `src/lib/__tests__/safety.test.ts` | Normal agent calls are allowed inside budget, and over-budget agent calls are rejected with HTTP 429 and blocked cost usage. |
| CoinGecko market data | `npm run test:e2e`, `src/lib/__tests__/coingecko.test.ts` | Market API returns CoinGecko provider metadata and explicit `fresh`, `stale`, or `fallback` freshness labels. |
| Paper trading | `npm run test`, `npm run test:e2e`, `npm run test:browser` | Long/short paper positions, P&L, ticket validation, spot-short rejection, and journaled browser submission all work without calling MEXC. |
| Operator execution choice | `npm run test:browser`, `ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true npm run test:mexc-live` | Browser workflows expose Paper Trade and Live Trade choices for the selected trade. Paper remains selected by default; live uses the same selected trade only after guards pass. |
| Risk Manager | `src/lib/__tests__/safety.test.ts`, `src/lib/__tests__/agent-workbench.test.ts`, `npm run test:e2e` | Risk approvals are exact-trade fingerprint approvals, vetoes surface clearly, and live execution cannot bypass Risk Manager. |
| Live-trading rejection matrix | `npm run test:e2e`, `npm run test:browser` | Live orders reject for global live-off, missing credentials, non-admin session, missing manual confirmation, exact Risk Manager failure, product flag, emergency stop, and no-trade mode. Browser workflow also proves the visible rejection control stays blocked. |
| MEXC guarded live validation | `ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true npm run test:mexc-live` | With valid `.env.local` MEXC credentials, Chromium validates system health/diagnostics, paper execution, guarded MEXC `/api/v3/order/test` validation, manual-confirmation rejection, and MEXC-backed reconciliation from sanitized evidence. |
| MEXC rejection diagnostics | `src/lib/__tests__/safety.test.ts`, guarded live failure evidence | If AlphaDesk guards pass but MEXC rejects the validation/order for permissions, pair eligibility, IP restrictions, or order shape, the UI classifies it as an exchange blocker and gives a no-secret operator action. |
| MEXC public connectivity | `npm run diagnose:mexc` | DNS and the public MEXC Spot V3 server-time endpoint respond without exposing credentials. Failure here explains why account diagnostics and live validation cannot complete. |
| MEXC live eligibility probe | `ALPHADESK_ENABLE_LIVE_TESTNET_E2E=true npm run diagnose:mexc-live` | A local production server calls guarded `/api/live-order` with temporary admin auth and the same tiny BTCUSDT spot shape. It prints sanitized acceptance or rejection evidence without replacing browser-level validation. |
| MEXC secret safety | `src/lib/__tests__/safety.test.ts`, `npm run test:e2e` | MEXC status exposes only readiness booleans and safe mode labels. Test secrets are checked for leaks in route/UI/API outputs. |
| Journal and audit logs | `npm run test:e2e`, `npm run test:browser`, `src/lib/__tests__/server-audit-log.test.ts` | Browser actions create journal evidence, optional server JSONL audit writes sanitized primitive metadata, and generated audit artifacts are ignored/cleaned. |
| Reports and calibration | `src/lib/__tests__/forecast-calibration.test.ts`, `npm run test:e2e`, `npm run test:browser` | Reports render dynamic calibration sections with sample counts and Brier scores from current desk state. |
| Settings and private vault | `src/lib/__tests__/desk-vault.test.ts`, `npm run test:browser` | Browser creates an encrypted vault payload, passphrase remains user-held, and generated payload format is encrypted. |
| System health | `npm run test:e2e`, `npm run test:browser` | Health confirms paper trading ON, live trading OFF, MEXC credential absence in staging, server audit posture, and safety defaults. |
| Route coverage | `npm run test:e2e`, `npm run test:browser` | Required routes render protected workstation surfaces and browser navigation covers core operator flows. |
| Vercel readiness | `npm run build`, `DEPLOYMENT.md` | Production build succeeds and deployment docs require all gates before deployment. |

## Known Non-Completion Items

These remain outside the validated scope even after safe staging and MEXC live-validation gates pass:

- Managed durable database/object storage for multi-user or serverless audit persistence.
- Full account-based authentication with granular roles beyond access/admin codes.
- Scheduled/server-side historical forecast calibration jobs beyond browser-local state.
- Real-capital mainnet execution review by a second engineer.
- Broader browser coverage as new operator workflows are added.
- Real MEXC mainnet execution remains intentionally off unless `MEXC_ORDER_TEST_MODE=false`, `ALLOW_MAINNET_LIVE_TRADING=true`, and every live guard passes.
