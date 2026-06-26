import { describe, expect, it } from "vitest";
import { buildForecastCalibration } from "../forecast-calibration";
import type { JournalEntry, PaperPosition, TradeIntent } from "../types";

const idea: TradeIntent = {
  confidence: 0.75,
  entryPrice: 100,
  id: "idea-test-long",
  leverage: 1,
  product: "spot",
  quantity: 1,
  side: "long",
  stopLoss: 90,
  symbol: "BTCUSDT",
  takeProfit: 120,
  thesis: "Test idea.",
};
const winningPosition: PaperPosition = {
  closedAt: "2026-06-04T01:00:00.000Z",
  entryPrice: 100,
  id: "paper-idea-test-long",
  markPrice: 112,
  openedAt: "2026-06-04T00:00:00.000Z",
  product: "spot",
  quantity: 1,
  realizedPnlUsd: 12,
  side: "long",
  symbol: "BTCUSDT",
  unrealizedPnlUsd: 0,
};
const veto: JournalEntry = {
  actor: "risk-manager",
  event: "trade-veto",
  id: "veto-1",
  metadata: { reasonCount: 2 },
  summary: "Risk vetoed an oversized trade.",
  timestamp: "2026-06-04T00:00:00.000Z",
};

describe("forecast calibration", () => {
  it("builds dynamic calibration from closed paper trades and vetoes", () => {
    const rows = buildForecastCalibration({
      ideas: [idea],
      journal: [veto],
      positions: [winningPosition],
    });
    const direction = rows.find((row) => row.label === "Agent direction calls");
    const vetoSaves = rows.find((row) => row.label === "Risk veto saves");
    const exits = rows.find((row) => row.label === "Paper exits");

    expect(direction?.sampleSize).toBe(1);
    expect(direction?.accuracyPct).toBe(100);
    expect(direction?.brierScore).toBe(0.06);
    expect(vetoSaves?.sampleSize).toBe(1);
    expect(vetoSaves?.accuracyPct).toBe(100);
    expect(exits?.sampleSize).toBe(1);
  });

  it("returns beginner explanations for empty calibration samples", () => {
    const rows = buildForecastCalibration({
      ideas: [],
      journal: [],
      positions: [],
    });

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.sampleSize === 0)).toBe(true);
    expect(rows.map((row) => row.beginnerExplanation).join(" ")).toContain(
      "No closed paper trades",
    );
  });
});
