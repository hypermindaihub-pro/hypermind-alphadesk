# MEXC Network Troubleshooting

AlphaDesk is not exchange-certified until the local server can reach MEXC Spot V3 over HTTPS.

## Current blocker shape

If `npm run diagnose:mexc` reports:

```json
{
  "dns": { "ok": true },
  "tcp443": { "ok": false, "error": "EACCES" },
  "publicServerTime": { "ok": false, "error": "fetch failed / EACCES" }
}
```

then DNS is working, but this machine or network is preventing outbound TCP 443 to `api.mexc.com`.

## Safe checks

These checks do not print credentials:

```powershell
npm run diagnose:mexc
npm run diagnose:network
$env:ALPHADESK_ENABLE_LIVE_TESTNET_E2E="true"; npm run diagnose:mexc-live
$env:ALPHADESK_ENABLE_LIVE_TESTNET_E2E="true"; npm run test:mexc-live
Test-NetConnection api.mexc.com -Port 443
```

`npm run diagnose:network` compares MEXC, CoinGecko, and a generic HTTPS endpoint. If all three show DNS success but TCP 443/HTTPS failure, the blocker is local outbound HTTPS rather than a MEXC-only issue.

## Things to inspect

- Windows Defender Firewall outbound rules for Node.js and PowerShell.
- Antivirus or endpoint protection blocking Node socket creation.
- VPN, proxy, corporate DNS, or ISP filtering for MEXC/Akamai IP ranges.
- MEXC API key IP allowlist, if the network path works but signed requests fail later.
- Region/account eligibility, KYC, spot trading permission, or API trading permission, if signed requests reach MEXC but are rejected.

## Certification rule

Do not mark AlphaDesk complete while this blocker remains. Passing Core MVP validation is not enough; MEXC execution certification requires successful public diagnostics plus guarded `/api/v3/order/test` validation through the full AlphaDesk live guard chain.
