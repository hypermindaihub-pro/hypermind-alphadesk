import type { JournalEntry, PaperPosition, TradeIntent } from "./types";

export type ForecastCalibration = {
  label: string;
  sampleSize: number;
  brierScore: number;
  accuracyPct: number;
  beginnerExplanation: string;
};

type ForecastOutcome = {
  probability: number;
  outcome: 0 | 1;
};

export type ForecastCalibrationInput = {
  ideas: TradeIntent[];
  positions: PaperPosition[];
  journal: JournalEntry[];
};

function brierScore(samples: ForecastOutcome[]): number {
  if (!samples.length) {
    return 0;
  }

  const total = samples.reduce(
    (sum, sample) => sum + (sample.probability - sample.outcome) ** 2,
    0,
  );

  return Number((total / samples.length).toFixed(2));
}

function accuracyPct(samples: ForecastOutcome[]): number {
  if (!samples.length) {
    return 0;
  }

  const hits = samples.filter((sample) =>
    sample.probability >= 0.5 ? sample.outcome === 1 : sample.outcome === 0,
  ).length;

  return Math.round((hits / samples.length) * 100);
}

function row(
  label: string,
  samples: ForecastOutcome[],
  explanation: string,
): ForecastCalibration {
  return {
    accuracyPct: accuracyPct(samples),
    beginnerExplanation: explanation,
    brierScore: brierScore(samples),
    label,
    sampleSize: samples.length,
  };
}

function ideaForPosition(
  position: PaperPosition,
  ideas: TradeIntent[],
): TradeIntent | undefined {
  const fromId = position.id.startsWith("paper-")
    ? ideas.find((idea) => position.id.includes(idea.id))
    : undefined;

  return (
    fromId ??
    ideas.find(
      (idea) =>
        idea.symbol === position.symbol &&
        idea.side === position.side &&
        idea.product === position.product,
    )
  );
}

export function buildForecastCalibration(
  input: ForecastCalibrationInput,
): ForecastCalibration[] {
  const closedPositions = input.positions.filter(
    (position) => position.closedAt && position.realizedPnlUsd !== undefined,
  );
  const matchedDirectionSamples = closedPositions
    .map((position): ForecastOutcome | null => {
      const idea = ideaForPosition(position, input.ideas);

      if (!idea) {
        return null;
      }

      return {
        outcome: (position.realizedPnlUsd ?? 0) > 0 ? 1 : 0,
        probability: Math.max(0.01, Math.min(0.99, idea.confidence)),
      };
    })
    .filter((sample): sample is ForecastOutcome => Boolean(sample));
  const paperExitSamples = closedPositions.map((position): ForecastOutcome => ({
    outcome: (position.realizedPnlUsd ?? 0) > 0 ? 1 : 0,
    probability: 0.62,
  }));
  const vetoEntries = input.journal.filter((entry) =>
    ["trade-veto", "paper-ticket-rejected", "live-order-rejected"].includes(
      entry.event,
    ),
  );
  const vetoSamples = vetoEntries.map((entry): ForecastOutcome => {
    const reasonCount = Number(entry.metadata.reasonCount ?? entry.metadata.errorCount ?? 1);

    return {
      outcome: reasonCount > 0 ? 1 : 0,
      probability: 0.7,
    };
  });

  return [
    row(
      "Agent direction calls",
      matchedDirectionSamples,
      matchedDirectionSamples.length
        ? "Compares idea confidence with closed paper trade outcomes for matching symbol, side, and product."
        : "No closed paper trades match saved ideas yet. Close paper positions to calibrate agent direction calls.",
    ),
    row(
      "Risk veto saves",
      vetoSamples,
      vetoSamples.length
        ? "Tracks whether veto and rejection events had concrete reasons, so blocked ideas remain auditable."
        : "No veto or rejected-ticket samples yet. Rejected ideas will build this calibration history.",
    ),
    row(
      "Paper exits",
      paperExitSamples,
      paperExitSamples.length
        ? "Uses closed paper trades to estimate whether simulated exits are producing positive outcomes."
        : "No closed paper exits yet. Close simulated positions to start measuring exit discipline.",
    ),
  ];
}
