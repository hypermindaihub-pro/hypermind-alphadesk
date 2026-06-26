import {
  DESK_STORAGE_KEY,
  parseStoredDeskState,
  type PersistedDeskState,
} from "./desk-storage";

export const DESK_ENCRYPTED_STORAGE_KEY = "hypermind.alphadesk.encrypted-desk.v1";

export type DeskPersistenceMode =
  | "plaintext"
  | "encrypted-locked"
  | "encrypted-unlocked";

export type InitialDeskStorage = {
  state: PersistedDeskState;
  mode: DeskPersistenceMode;
  status: string;
};

export function selectInitialDeskStorage(
  rawPlaintext: string | null,
  rawEncrypted: string | null,
  fallback: PersistedDeskState,
): InitialDeskStorage {
  if (rawEncrypted?.trim()) {
    return {
      mode: "encrypted-locked",
      state: fallback,
      status:
        "Encrypted desk storage found. Unlock it in Settings; plaintext autosave is paused.",
    };
  }

  const restored = parseStoredDeskState(rawPlaintext, fallback);

  return {
    mode: "plaintext",
    state: restored,
    status:
      restored === fallback
        ? "No previous local desk state found. Seed state is active."
        : "Private local desk state restored from this browser.",
  };
}

export function clearAllDeskStorage(storage: Storage): void {
  storage.removeItem(DESK_STORAGE_KEY);
  storage.removeItem(DESK_ENCRYPTED_STORAGE_KEY);
}
