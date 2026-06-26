import type { JournalEntry } from "./types";

export function createJournalEntry(
  entry: Omit<JournalEntry, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  },
): JournalEntry {
  return {
    id: entry.id ?? `journal-${Date.now()}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    actor: entry.actor,
    event: entry.event,
    summary: entry.summary,
    metadata: entry.metadata,
  };
}

export function appendJournalEntry(
  entries: JournalEntry[],
  entry: JournalEntry,
): JournalEntry[] {
  return [entry, ...entries];
}
