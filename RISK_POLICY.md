# Risk Policy

AlphaDesk is paper-first. AI-generated trade ideas are hypotheses, not instructions to trade.

## Default Limits

- Max position: 2500 USD notional
- Max leverage: 2x
- Max daily drawdown: 3%
- Minimum confidence: 62%

## Risk Manager Vetoes

Risk Manager vetoes a trade when:

- Position size exceeds the configured max.
- Leverage exceeds the configured max.
- Daily drawdown exceeds the configured cap.
- Stop loss is missing or invalid.
- Agent confidence is below the configured minimum.
- A short idea is incorrectly assigned to spot.

## Exact Trade Approval

Risk approval is tied to an exact fingerprint: id, symbol, side, product, quantity, entry, stop, target, and leverage. Changing any of those details requires a new approval.

## Live Trading

Live trading is disabled by default. Operators must choose Live Trade for the selected trade; Paper Trade remains the default selected path. Even when live is enabled, a live order must pass every guard listed in `README.md`. Risk approval alone is never enough.

MEXC test-order mode is the default live validation environment. Real MEXC mainnet order placement is rejected unless `MEXC_ORDER_TEST_MODE=false` and `ALLOW_MAINNET_LIVE_TRADING=true` are set in addition to all ordinary live guards.
