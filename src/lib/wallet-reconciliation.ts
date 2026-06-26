import type { ReconciliationMode, ReconciliationSeverity } from "./order-reconciliation";
import type { PaperPosition } from "./types";

export type LocalSpotInventory = {
  coin: string;
  symbol: string;
  quantity: number;
  markPrice: number;
  estimatedUsdValue: number;
  updatedAt: string;
};

export type ExchangeWalletBalance = {
  coin: string;
  exchange: "mexc" | "simulated";
  walletBalance: number;
  equity: number;
  locked: number;
  borrowed: number;
  usdValue: number;
  updatedAt: string;
};

export type WalletReconciliationRow = {
  coin: string;
  severity: ReconciliationSeverity;
  status: "matched" | "missing-wallet-balance" | "mismatch" | "orphan-wallet-balance";
  localInventory?: LocalSpotInventory;
  walletBalance?: ExchangeWalletBalance;
  issues: string[];
  beginnerExplanation: string;
};

export type WalletReconciliationSummary = {
  checkedAt: string;
  mode: ReconciliationMode;
  status: ReconciliationSeverity;
  matched: number;
  mismatched: number;
  missingWalletBalance: number;
  orphanWalletBalance: number;
  totalLocal: number;
  totalWallet: number;
  rows: WalletReconciliationRow[];
};

const QUANTITY_TOLERANCE = 0.00000001;
const USD_TOLERANCE = 0.01;

export function coinFromSpotSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/USDT$/, "").replace(/USDC$/, "");
}

function explainRow(row: Omit<WalletReconciliationRow, "beginnerExplanation">): string {
  if (row.status === "matched") {
    return "Local spot inventory and wallet balance agree.";
  }

  if (row.status === "missing-wallet-balance") {
    return "AlphaDesk has local spot inventory, but the exchange wallet did not return that coin.";
  }

  if (row.status === "orphan-wallet-balance") {
    return "The exchange wallet returned a coin that is not represented in local spot inventory.";
  }

  return "The coin exists locally and in the wallet, but quantity or USD value differs.";
}

export function paperPositionsToLocalSpotInventory(
  positions: PaperPosition[],
): LocalSpotInventory[] {
  const grouped = new Map<string, PaperPosition[]>();

  for (const position of positions.filter(
    (item) => !item.closedAt && item.product === "spot" && item.side === "long",
  )) {
    const coin = coinFromSpotSymbol(position.symbol);
    grouped.set(coin, [...(grouped.get(coin) ?? []), position]);
  }

  return Array.from(grouped.entries()).map(([coin, items]) => {
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const latest = items.reduce((current, item) =>
      item.openedAt > current.openedAt ? item : current,
    );

    return {
      coin,
      estimatedUsdValue: quantity * latest.markPrice,
      markPrice: latest.markPrice,
      quantity,
      symbol: latest.symbol,
      updatedAt: latest.closedAt ?? latest.openedAt,
    };
  });
}

export function createSimulatedWalletBalances(
  inventory: LocalSpotInventory[],
): ExchangeWalletBalance[] {
  return inventory.map((item) => ({
    borrowed: 0,
    coin: item.coin,
    equity: item.quantity,
    exchange: "simulated",
    locked: 0,
    updatedAt: item.updatedAt,
    usdValue: item.estimatedUsdValue,
    walletBalance: item.quantity,
  }));
}

export function reconcileWalletBalances(
  localInventory: LocalSpotInventory[],
  walletBalances: ExchangeWalletBalance[],
  mode: ReconciliationMode,
  checkedAt = new Date().toISOString(),
): WalletReconciliationSummary {
  const walletByCoin = new Map(walletBalances.map((balance) => [balance.coin, balance]));
  const matchedWalletCoins = new Set<string>();
  const rows: WalletReconciliationRow[] = [];

  for (const local of localInventory) {
    const walletBalance = walletByCoin.get(local.coin);

    if (!walletBalance) {
      const row: Omit<WalletReconciliationRow, "beginnerExplanation"> = {
        coin: local.coin,
        issues: ["No exchange wallet balance matched this local spot coin."],
        localInventory: local,
        severity: "fail",
        status: "missing-wallet-balance",
      };

      rows.push({ ...row, beginnerExplanation: explainRow(row) });
      continue;
    }

    matchedWalletCoins.add(walletBalance.coin);

    const issues: string[] = [];

    if (Math.abs(local.quantity - walletBalance.walletBalance) > QUANTITY_TOLERANCE) {
      issues.push(
        `Quantity mismatch: local ${local.quantity}, wallet ${walletBalance.walletBalance}.`,
      );
    }

    if (Math.abs(local.estimatedUsdValue - walletBalance.usdValue) > USD_TOLERANCE) {
      issues.push(
        `USD value mismatch: local ${local.estimatedUsdValue.toFixed(
          2,
        )}, wallet ${walletBalance.usdValue.toFixed(2)}.`,
      );
    }

    if (walletBalance.borrowed > QUANTITY_TOLERANCE) {
      issues.push(`Wallet reports borrowed ${walletBalance.borrowed} ${local.coin}.`);
    }

    const row: Omit<WalletReconciliationRow, "beginnerExplanation"> = {
      coin: local.coin,
      issues,
      localInventory: local,
      severity: issues.length ? "warn" : "pass",
      status: issues.length ? "mismatch" : "matched",
      walletBalance,
    };

    rows.push({ ...row, beginnerExplanation: explainRow(row) });
  }

  for (const walletBalance of walletBalances) {
    if (matchedWalletCoins.has(walletBalance.coin)) {
      continue;
    }

    const row: Omit<WalletReconciliationRow, "beginnerExplanation"> = {
      coin: walletBalance.coin,
      issues: ["No local AlphaDesk spot inventory matched this wallet coin."],
      severity: "warn",
      status: "orphan-wallet-balance",
      walletBalance,
    };

    rows.push({ ...row, beginnerExplanation: explainRow(row) });
  }

  const matched = rows.filter((row) => row.status === "matched").length;
  const mismatched = rows.filter((row) => row.status === "mismatch").length;
  const missingWalletBalance = rows.filter(
    (row) => row.status === "missing-wallet-balance",
  ).length;
  const orphanWalletBalance = rows.filter(
    (row) => row.status === "orphan-wallet-balance",
  ).length;
  const status: ReconciliationSeverity =
    missingWalletBalance > 0
      ? "fail"
      : mismatched > 0 || orphanWalletBalance > 0
        ? "warn"
        : "pass";

  return {
    checkedAt,
    matched,
    mismatched,
    missingWalletBalance,
    mode,
    orphanWalletBalance,
    rows,
    status,
    totalLocal: localInventory.length,
    totalWallet: walletBalances.length,
  };
}
