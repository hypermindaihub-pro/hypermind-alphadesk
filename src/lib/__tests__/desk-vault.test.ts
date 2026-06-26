import { describe, expect, it } from "vitest";
import { createPersistedDeskState } from "../desk-storage";
import {
  createAccountDiagnosticsHistoryEntry,
  createLaunchReadinessHistoryEntry,
} from "../desk-history";
import { buildAccountDiagnostics } from "../account-diagnostics";
import { getMexcAdapterStatus } from "../mexc-status";
import { getAlphaConfig } from "../config";
import { buildLaunchReadinessSnapshot } from "../launch-readiness";
import { evaluateRisk } from "../risk-manager";
import {
  decryptDeskVault,
  DESK_VAULT_FORMAT,
  encryptDeskVault,
} from "../desk-vault";
import {
  seedJournalEntries,
  seedPaperPositions,
  seedPortfolio,
  seedTradeIdeas,
} from "../sample-data";

const config = getAlphaConfig({});
const exchangeStatus = getMexcAdapterStatus({});
const accountDiagnostics = buildAccountDiagnostics({ exchangeStatus, config });
const readiness = buildLaunchReadinessSnapshot({
  accountDiagnostics,
  adminPermission: false,
  exchangeStatus,
  config,
  manualConfirmation: "",
  riskDecision: evaluateRisk(seedTradeIdeas[1], seedPortfolio, config),
  trade: seedTradeIdeas[1],
});

const state = createPersistedDeskState({
  diagnosticsHistory: [
    createAccountDiagnosticsHistoryEntry(accountDiagnostics, "2026-06-04T00:00:00.000Z"),
  ],
  selectedIdeaId: seedTradeIdeas[1].id,
  ideas: seedTradeIdeas,
  positions: seedPaperPositions,
  journal: seedJournalEntries,
  readinessHistory: [
    createLaunchReadinessHistoryEntry(readiness, "2026-06-04T00:00:00.000Z"),
  ],
});

describe("encrypted desk vault", () => {
  it("encrypts and decrypts a persisted desk state", async () => {
    const rawVault = await encryptDeskVault(
      state,
      "correct horse battery staple",
      "2026-06-03T00:00:00.000Z",
    );
    const envelope = JSON.parse(rawVault) as { format: string; ciphertext: string };
    const restored = await decryptDeskVault(
      rawVault,
      "correct horse battery staple",
      state,
    );

    expect(envelope.format).toBe(DESK_VAULT_FORMAT);
    expect(envelope.ciphertext).not.toContain("BTCUSDT");
    expect(envelope.ciphertext).not.toContain("paper-ready");
    expect(restored.selectedIdeaId).toBe(state.selectedIdeaId);
    expect(restored.ideas).toHaveLength(state.ideas.length);
    expect(restored.readinessHistory).toHaveLength(1);
    expect(restored.diagnosticsHistory).toHaveLength(1);
  });

  it("rejects weak passphrases and wrong passphrases", async () => {
    await expect(encryptDeskVault(state, "too-short")).rejects.toThrow(
      "at least 12 characters",
    );

    const rawVault = await encryptDeskVault(state, "correct horse battery staple");

    await expect(
      decryptDeskVault(rawVault, "wrong horse battery staple", state),
    ).rejects.toThrow();
  });
});
