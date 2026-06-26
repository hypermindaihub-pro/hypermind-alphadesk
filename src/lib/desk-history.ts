import type { AccountDiagnostics } from "./account-diagnostics";
import type { LaunchReadinessSnapshot } from "./launch-readiness";

export type LaunchReadinessHistoryEntry = {
  id: string;
  timestamp: string;
  status: LaunchReadinessSnapshot["status"];
  score: number;
  blockerCount: number;
  warningCount: number;
  paperTradingEnabled: boolean;
  liveTradingEnabled: boolean;
  liveExecutionAllowed: boolean;
  summary: string;
};

export type AccountDiagnosticsHistoryEntry = {
  id: string;
  timestamp: string;
  status: AccountDiagnostics["status"];
  source: AccountDiagnostics["source"];
  credentialsReady: boolean;
  testnet: boolean;
  checkCount: number;
  warningCount: number;
  failCount: number;
  summary: string;
};

export function createLaunchReadinessHistoryEntry(
  snapshot: LaunchReadinessSnapshot,
  timestamp = new Date().toISOString(),
): LaunchReadinessHistoryEntry {
  return {
    blockerCount: snapshot.blockers.length,
    id: `readiness-${Date.parse(timestamp) || Date.now()}`,
    liveExecutionAllowed: snapshot.liveExecutionAllowed,
    liveTradingEnabled: snapshot.liveTradingEnabled,
    paperTradingEnabled: snapshot.paperTradingEnabled,
    score: snapshot.score,
    status: snapshot.status,
    summary: snapshot.beginnerExplanation,
    timestamp,
    warningCount: snapshot.warnings.length,
  };
}

export function createAccountDiagnosticsHistoryEntry(
  diagnostics: AccountDiagnostics,
  timestamp = new Date().toISOString(),
): AccountDiagnosticsHistoryEntry {
  return {
    checkCount: diagnostics.checks.length,
    credentialsReady: diagnostics.exchange.credentialsReady,
    failCount: diagnostics.checks.filter((check) => check.status === "fail").length,
    id: `diagnostics-${Date.parse(timestamp) || Date.now()}`,
    source: diagnostics.source,
    status: diagnostics.status,
    summary: diagnostics.beginnerExplanation,
    testnet: diagnostics.exchange.testnet,
    timestamp,
    warningCount: diagnostics.checks.filter((check) => check.status === "warn").length,
  };
}

export function prependCapped<T>(entries: T[], entry: T, maxEntries: number): T[] {
  return [entry, ...entries].slice(0, maxEntries);
}
