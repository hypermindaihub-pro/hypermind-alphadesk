import { describe, expect, it } from "vitest";
import {
  createPersistedDeskState,
  DESK_STORAGE_KEY,
  serializeDeskState,
} from "../desk-storage";
import {
  clearAllDeskStorage,
  DESK_ENCRYPTED_STORAGE_KEY,
  selectInitialDeskStorage,
} from "../desk-secure-storage";
import { seedJournalEntries, seedPaperPositions, seedTradeIdeas } from "../sample-data";

const fallback = createPersistedDeskState({
  selectedIdeaId: seedTradeIdeas[0].id,
  ideas: seedTradeIdeas,
  positions: seedPaperPositions,
  journal: seedJournalEntries,
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  } as Storage;
}

describe("secure desk storage selection", () => {
  it("locks encrypted storage instead of restoring plaintext", () => {
    const plaintext = serializeDeskState(
      createPersistedDeskState({
        selectedIdeaId: "plain-idea",
        ideas: [
          {
            confidence: 0.8,
            entryPrice: 1,
            id: "plain-idea",
            leverage: 1,
            product: "spot",
            quantity: 1,
            side: "long",
            stopLoss: 0.9,
            symbol: "PLAINTEXTUSDT",
            thesis: "This plaintext copy must not win.",
          },
        ],
        journal: [],
        positions: [],
      }),
    );

    const selected = selectInitialDeskStorage(
      plaintext,
      "{\"ciphertext\":\"encrypted\"}",
      fallback,
    );

    expect(selected.mode).toBe("encrypted-locked");
    expect(selected.state).toBe(fallback);
    expect(selected.status).toContain("Encrypted desk storage found");
  });

  it("restores plaintext only when no encrypted desk exists", () => {
    const plaintext = serializeDeskState(fallback);
    const selected = selectInitialDeskStorage(plaintext, null, fallback);

    expect(selected.mode).toBe("plaintext");
    expect(selected.state.selectedIdeaId).toBe(fallback.selectedIdeaId);
  });

  it("clears plaintext and encrypted desk storage together", () => {
    const storage = memoryStorage();

    storage.setItem(DESK_STORAGE_KEY, "plain");
    storage.setItem(DESK_ENCRYPTED_STORAGE_KEY, "encrypted");
    clearAllDeskStorage(storage);

    expect(storage.getItem(DESK_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(DESK_ENCRYPTED_STORAGE_KEY)).toBeNull();
  });
});
