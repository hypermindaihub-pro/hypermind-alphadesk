import type { AlphaConfig } from "./config";
import { getAlphaConfig } from "./config";
import type { CostUsage } from "./types";

const ESTIMATED_USD_PER_1K_INPUT = 0.00025;
const ESTIMATED_USD_PER_1K_OUTPUT = 0.002;

export function estimateAgentCost(
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  spentTodayUsd = 0,
  config: AlphaConfig = getAlphaConfig(),
): CostUsage {
  const estimatedCostUsd = Number(
    (
      (estimatedInputTokens / 1000) * ESTIMATED_USD_PER_1K_INPUT +
      (estimatedOutputTokens / 1000) * ESTIMATED_USD_PER_1K_OUTPUT
    ).toFixed(6),
  );
  const projectedSpend = spentTodayUsd + estimatedCostUsd;
  const allowed =
    projectedSpend <= config.cost.dailyBudgetUsd &&
    projectedSpend <= config.cost.hardStopUsd;

  return {
    model: config.openAiModel,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd,
    dailyBudgetUsd: config.cost.dailyBudgetUsd,
    hardStopUsd: config.cost.hardStopUsd,
    allowed,
    message: allowed
      ? "Agent call is inside the daily budget."
      : "Cost control blocks the agent call because the projected spend exceeds a configured limit.",
  };
}
