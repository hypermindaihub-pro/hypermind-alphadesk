import { describe, expect, it } from "vitest";
import {
  createPersistedDeskState,
  DESK_STORAGE_VERSION,
  parseStoredDeskState,
  serializeDeskState,
} from "../desk-storage";
import {
  createAccountDiagnosticsHistoryEntry,
  createLaunchReadinessHistoryEntry,
} from "../desk-history";
import { buildAccountDiagnostics } from "../account-diagnostics";
import { getMexcAdapterStatus } from "../mexc-status";
import { getAlphaConfig } from "../config";
import { buildLaunchReadinessSnapshot } from "../launch-readiness";
import { evaluateRisk } from "../risk-manager";
import { seedJournalEntries, seedPaperPositions, seedTradeIdeas } from "../sample-data";

const fallback = createPersistedDeskState({
  selectedIdeaId: seedTradeIdeas[0].id,
  ideas: seedTradeIdeas,
  positions: seedPaperPositions,
  journal: seedJournalEntries,
});
const config = getAlphaConfig({});
const exchangeStatus = getMexcAdapterStatus({});
const accountDiagnostics = buildAccountDiagnostics({ exchangeStatus, config });
const readiness = buildLaunchReadinessSnapshot({
  accountDiagnostics,
  adminPermission: false,
  exchangeStatus,
  config,
  manualConfirmation: "",
  riskDecision: evaluateRisk(seedTradeIdeas[1], {
    cashUsd: 8640,
    dailyDrawdownPct: 0.7,
    dailyRealizedPnlUsd: 84,
    equityUsd: 10000,
  }),
  trade: seedTradeIdeas[1],
});

describe("desk storage", () => {
  it("round-trips validated local desk state", () => {
    const raw = serializeDeskState(fallback);
    const parsed = parseStoredDeskState(raw, fallback);

    expect(parsed.version).toBe(DESK_STORAGE_VERSION);
    expect(parsed.selectedIdeaId).toBe(fallback.selectedIdeaId);
    expect(parsed.ideas).toHaveLength(fallback.ideas.length);
    expect(parsed.positions).toHaveLength(fallback.positions.length);
    expect(parsed.journal).toHaveLength(fallback.journal.length);
    expect(parsed.readinessHistory).toHaveLength(0);
    expect(parsed.diagnosticsHistory).toHaveLength(0);
  });

  it("falls back for malformed or incompatible storage", () => {
    expect(parseStoredDeskState("{bad", fallback)).toBe(fallback);
    expect(
      parseStoredDeskState(JSON.stringify({ version: 999, ideas: [] }), fallback),
    ).toBe(fallback);
  });

  it("sanitizes records and does not preserve arbitrary nested metadata", () => {
    const raw = JSON.stringify({
      version: DESK_STORAGE_VERSION,
      selectedIdeaId: "idea-1",
      ideas: [
        {
          id: "idea-1",
          symbol: "BTCUSDT",
          side: "long",
          product: "spot",
          quantity: 0.01,
          entryPrice: 70000,
          stopLoss: 68000,
          leverage: 1,
          confidence: 0.7,
          thesis: "Valid local idea",
        },
        { id: "bad" },
      ],
      positions: [{ id: "invalid-position" }],
      journal: [
        {
          id: "journal-1",
          timestamp: "2026-05-31T00:00:00.000Z",
          actor: "user",
          event: "note",
          summary: "A safe note",
          metadata: {
            symbol: "BTCUSDT",
            nested: { should: "drop" },
          },
        },
      ],
      readinessHistory: [
        createLaunchReadinessHistoryEntry(readiness, "2026-06-04T00:00:00.000Z"),
        { id: "bad-history" },
      ],
      diagnosticsHistory: [
        createAccountDiagnosticsHistoryEntry(
          accountDiagnostics,
          "2026-06-04T00:00:00.000Z",
        ),
        { id: "bad-diagnostics" },
      ],
    });

    const parsed = parseStoredDeskState(raw, fallback);

    expect(parsed.ideas).toHaveLength(1);
    expect(parsed.positions).toHaveLength(0);
    expect(parsed.journal[0].metadata).toEqual({ symbol: "BTCUSDT" });
    expect(parsed.readinessHistory).toHaveLength(1);
    expect(parsed.diagnosticsHistory).toHaveLength(1);
  });

  it("migrates version 1 desk state with empty structured histories", () => {
    const raw = JSON.stringify({
      version: 1,
      selectedIdeaId: "idea-1",
      ideas: [
        {
          id: "idea-1",
          symbol: "BTCUSDT",
          side: "long",
          product: "spot",
          quantity: 0.01,
          entryPrice: 70000,
          stopLoss: 68000,
          leverage: 1,
          confidence: 0.7,
          thesis: "Version 1 idea",
        },
      ],
      positions: [],
      journal: [],
    });

    const parsed = parseStoredDeskState(raw, fallback);

    expect(parsed.version).toBe(DESK_STORAGE_VERSION);
    expect(parsed.ideas[0].thesis).toBe("Version 1 idea");
    expect(parsed.readinessHistory).toEqual([]);
    expect(parsed.diagnosticsHistory).toEqual([]);
  });
});
