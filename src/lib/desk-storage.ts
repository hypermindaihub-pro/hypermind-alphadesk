import type { JournalEntry, PaperPosition, TradeIntent } from "./types";
import type {
  AccountDiagnosticsHistoryEntry,
  LaunchReadinessHistoryEntry,
} from "./desk-history";

export const DESK_STORAGE_KEY = "hypermind.alphadesk.local-desk.v1";
export const DESK_STORAGE_VERSION = 2;

export type PersistedDeskState = {
  version: typeof DESK_STORAGE_VERSION;
  selectedIdeaId: string;
  ideas: TradeIntent[];
  positions: PaperPosition[];
  journal: JournalEntry[];
  readinessHistory: LaunchReadinessHistoryEntry[];
  diagnosticsHistory: AccountDiagnosticsHistoryEntry[];
};

type DeskSeedState = Omit<
  PersistedDeskState,
  "diagnosticsHistory" | "readinessHistory" | "version"
> & {
  diagnosticsHistory?: AccountDiagnosticsHistoryEntry[];
  readinessHistory?: LaunchReadinessHistoryEntry[];
};

const MAX_IDEAS = 80;
const MAX_POSITIONS = 120;
const MAX_JOURNAL = 250;
const MAX_HISTORY = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeMetadata(
  metadata: unknown,
): Record<string, string | number | boolean> {
  if (!isRecord(metadata)) {
    return {};
  }

  const sanitized: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function sanitizeTrade(value: unknown): TradeIntent | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const symbol = readString(value.symbol);
  const side = value.side === "long" || value.side === "short" ? value.side : null;
  const product =
    value.product === "spot" || value.product === "derivatives"
      ? value.product
      : null;
  const quantity = readNumber(value.quantity);
  const entryPrice = readNumber(value.entryPrice);
  const stopLoss = readNumber(value.stopLoss);
  const leverage = readNumber(value.leverage);
  const confidence = readNumber(value.confidence);
  const thesis = readString(value.thesis);

  if (
    !id ||
    !symbol ||
    !side ||
    !product ||
    quantity === null ||
    entryPrice === null ||
    stopLoss === null ||
    leverage === null ||
    confidence === null ||
    !thesis
  ) {
    return null;
  }

  return {
    id,
    symbol,
    side,
    product,
    quantity,
    entryPrice,
    stopLoss,
    takeProfit: readNumber(value.takeProfit) ?? undefined,
    leverage,
    confidence,
    thesis,
  };
}

function sanitizePosition(value: unknown): PaperPosition | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const symbol = readString(value.symbol);
  const side = value.side === "long" || value.side === "short" ? value.side : null;
  const product =
    value.product === "spot" || value.product === "derivatives"
      ? value.product
      : side === "short"
        ? "derivatives"
        : "spot";
  const quantity = readNumber(value.quantity);
  const entryPrice = readNumber(value.entryPrice);
  const markPrice = readNumber(value.markPrice);
  const openedAt = readString(value.openedAt);
  const unrealizedPnlUsd = readNumber(value.unrealizedPnlUsd);

  if (
    !id ||
    !symbol ||
    !side ||
    quantity === null ||
    entryPrice === null ||
    markPrice === null ||
    !openedAt ||
    unrealizedPnlUsd === null
  ) {
    return null;
  }

  return {
    id,
    symbol,
    side,
    product,
    quantity,
    entryPrice,
    markPrice,
    openedAt,
    closedAt: readString(value.closedAt) ?? undefined,
    realizedPnlUsd: readNumber(value.realizedPnlUsd) ?? undefined,
    unrealizedPnlUsd,
  };
}

function sanitizeJournal(value: unknown): JournalEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const timestamp = readString(value.timestamp);
  const actor =
    value.actor === "system" ||
    value.actor === "agent" ||
    value.actor === "risk-manager" ||
    value.actor === "paper-trading" ||
    value.actor === "user"
      ? value.actor
      : null;
  const event = readString(value.event);
  const summary = readString(value.summary);

  if (!id || !timestamp || !actor || !event || !summary) {
    return null;
  }

  return {
    id,
    timestamp,
    actor,
    event,
    summary,
    metadata: sanitizeMetadata(value.metadata),
  };
}

function sanitizeReadinessHistory(value: unknown): LaunchReadinessHistoryEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const timestamp = readString(value.timestamp);
  const status =
    value.status === "blocked" ||
    value.status === "paper-ready" ||
    value.status === "live-ready"
      ? value.status
      : null;
  const score = readNumber(value.score);
  const blockerCount = readNumber(value.blockerCount);
  const warningCount = readNumber(value.warningCount);
  const summary = readString(value.summary);

  if (
    !id ||
    !timestamp ||
    !status ||
    score === null ||
    blockerCount === null ||
    warningCount === null ||
    !summary
  ) {
    return null;
  }

  return {
    blockerCount,
    id,
    liveExecutionAllowed: value.liveExecutionAllowed === true,
    liveTradingEnabled: value.liveTradingEnabled === true,
    paperTradingEnabled: value.paperTradingEnabled === true,
    score,
    status,
    summary,
    timestamp,
    warningCount,
  };
}

function sanitizeDiagnosticsHistory(
  value: unknown,
): AccountDiagnosticsHistoryEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const timestamp = readString(value.timestamp);
  const status =
    value.status === "pass" || value.status === "warn" || value.status === "fail"
      ? value.status
      : null;
  const source = value.source === "env" || value.source === "mexc" ? value.source : null;
  const checkCount = readNumber(value.checkCount);
  const warningCount = readNumber(value.warningCount);
  const failCount = readNumber(value.failCount);
  const summary = readString(value.summary);

  if (
    !id ||
    !timestamp ||
    !status ||
    !source ||
    checkCount === null ||
    warningCount === null ||
    failCount === null ||
    !summary
  ) {
    return null;
  }

  return {
    checkCount,
    credentialsReady: value.credentialsReady === true,
    failCount,
    id,
    source,
    status,
    summary,
    testnet: value.testnet === true,
    timestamp,
    warningCount,
  };
}

export function createPersistedDeskState(
  seed: DeskSeedState,
): PersistedDeskState {
  return {
    version: DESK_STORAGE_VERSION,
    selectedIdeaId: seed.selectedIdeaId,
    ideas: seed.ideas.slice(0, MAX_IDEAS),
    positions: seed.positions.slice(0, MAX_POSITIONS),
    journal: seed.journal.slice(0, MAX_JOURNAL),
    readinessHistory: (seed.readinessHistory ?? []).slice(0, MAX_HISTORY),
    diagnosticsHistory: (seed.diagnosticsHistory ?? []).slice(0, MAX_HISTORY),
  };
}

export function serializeDeskState(state: PersistedDeskState): string {
  return JSON.stringify(state);
}

export function parseStoredDeskState(
  raw: string | null,
  fallback: PersistedDeskState,
): PersistedDeskState {
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (
      !isRecord(parsed) ||
      (parsed.version !== DESK_STORAGE_VERSION && parsed.version !== 1)
    ) {
      return fallback;
    }

    const ideas = Array.isArray(parsed.ideas)
      ? parsed.ideas.map(sanitizeTrade).filter((idea): idea is TradeIntent => Boolean(idea))
      : [];
    const positions = Array.isArray(parsed.positions)
      ? parsed.positions
          .map(sanitizePosition)
          .filter((position): position is PaperPosition => Boolean(position))
      : [];
    const journal = Array.isArray(parsed.journal)
      ? parsed.journal
          .map(sanitizeJournal)
          .filter((entry): entry is JournalEntry => Boolean(entry))
      : [];
    const readinessHistory = Array.isArray(parsed.readinessHistory)
      ? parsed.readinessHistory
          .map(sanitizeReadinessHistory)
          .filter(
            (entry): entry is LaunchReadinessHistoryEntry => Boolean(entry),
          )
      : [];
    const diagnosticsHistory = Array.isArray(parsed.diagnosticsHistory)
      ? parsed.diagnosticsHistory
          .map(sanitizeDiagnosticsHistory)
          .filter(
            (entry): entry is AccountDiagnosticsHistoryEntry => Boolean(entry),
          )
      : [];
    const selectedIdeaId = readString(parsed.selectedIdeaId);

    if (!ideas.length || !selectedIdeaId) {
      return fallback;
    }

    return {
      version: DESK_STORAGE_VERSION,
      selectedIdeaId: ideas.some((idea) => idea.id === selectedIdeaId)
        ? selectedIdeaId
        : ideas[0].id,
      ideas: ideas.slice(0, MAX_IDEAS),
      positions: positions.slice(0, MAX_POSITIONS),
      journal: journal.slice(0, MAX_JOURNAL),
      readinessHistory: readinessHistory.slice(0, MAX_HISTORY),
      diagnosticsHistory: diagnosticsHistory.slice(0, MAX_HISTORY),
    };
  } catch {
    return fallback;
  }
}
