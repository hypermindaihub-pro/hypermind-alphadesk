export type LiveOrderFailureCategory =
  | "alphadesk-guard"
  | "exchange-auth"
  | "exchange-eligibility"
  | "exchange-parameter"
  | "network"
  | "unknown";

export type LiveOrderDiagnostic = {
  category: LiveOrderFailureCategory;
  label: string;
  operatorAction: string;
};

function includesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

export function classifyLiveOrderFailure(reasons: string[]): LiveOrderDiagnostic {
  const normalized = reasons.join(" ").toLowerCase();

  if (
    includesAny(normalized, [
      "regulatory restrictions",
      "permitted customer",
      "product or service you are seeking to access is not available",
      "restricted",
    ])
  ) {
    return {
      category: "exchange-eligibility",
      label: "Exchange account or regional eligibility restriction",
      operatorAction:
        "AlphaDesk reached the exchange after its live guards passed, but the exchange declined product access. Use an eligible MEXC account/network or resolve the account, region, or product restriction before retrying live validation.",
    };
  }

  if (
    includesAny(normalized, [
      "api key",
      "signature",
      "permission",
      "unauthorized",
      "invalid api",
    ])
  ) {
    return {
      category: "exchange-auth",
      label: "Exchange authentication or API permission issue",
      operatorAction:
        "Check server-side MEXC key permissions, IP restrictions, trading-pair permissions, account type, and API secret configuration. Do not expose or paste the secret value.",
    };
  }

  if (
    includesAny(normalized, [
      "request failed",
      "timed out",
      "enotfound",
      "fetch failed",
      "eacces",
      "could not connect",
    ])
  ) {
    return {
      category: "network",
      label: "Exchange network reachability issue",
      operatorAction:
        "Run the MEXC diagnostic and retry only after DNS and the public server-time endpoint are healthy.",
    };
  }

  if (
    includesAny(normalized, [
      "request parameter",
      "qty",
      "invalid symbol",
      "bad symbol",
      "minimum transaction",
      "maximum transaction",
      "quantity precision",
      "position idx",
      "positionidx",
      "param is error",
      "param cannot be null",
    ])
  ) {
    return {
      category: "exchange-parameter",
      label: "Exchange rejected the order shape",
      operatorAction:
        "Review symbol, product, quantity precision, position mode, and account instrument support before retrying with a smaller compatible testnet order.",
    };
  }

  if (
    includesAny(normalized, [
      "live_trading_enabled",
      "admin permission",
      "emergency stop",
      "no-trade mode",
      "manual confirmation",
      "risk manager",
      "live trading is disabled",
      "credentials are not configured",
      "mainnet live trading",
    ])
  ) {
    return {
      category: "alphadesk-guard",
      label: "AlphaDesk live guard rejection",
      operatorAction:
        "Resolve the listed AlphaDesk guard blockers. The live adapter will not be called until every guard passes for the exact selected trade.",
    };
  }

  return {
    category: "unknown",
    label: "Unclassified live-order rejection",
    operatorAction:
      "Review the sanitized rejection reasons and keep paper trading active until the cause is understood.",
  };
}
