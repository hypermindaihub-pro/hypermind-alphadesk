import type { AgentReasoning } from "./openai-agent";
import type { MarketSnapshot, RiskDecision, TradeIntent } from "./types";

export type AgentRole =
  | "market-analyst"
  | "risk-manager"
  | "execution-coach"
  | "journal-coach";

export type AgentWorkbenchRun = {
  role: AgentRole;
  title: string;
  mode: AgentReasoning["mode"];
  model: string;
  summary: string;
  bullets: string[];
  confidence: number;
  action: string;
  safetyNote: string;
};

export type AgentWorkbenchResult = {
  mode: AgentReasoning["mode"];
  model: string;
  runs: AgentWorkbenchRun[];
  beginnerExplanation: string;
};

type AgentWorkbenchInput = {
  reasoning: AgentReasoning;
  markets: MarketSnapshot[];
  ideas: TradeIntent[];
  riskDecision: RiskDecision;
};

function formatRiskReasons(decision: RiskDecision): string {
  const reasons = decision.vetoReasons.length > 0 ? decision.vetoReasons : decision.warnings;
  return reasons.length > 0 ? reasons.join("; ") : decision.explanation;
}

function strongestMomentum(markets: MarketSnapshot[]): MarketSnapshot | undefined {
  return markets.slice().sort((a, b) => b.change24h - a.change24h)[0];
}

function selectedIdea(ideas: TradeIntent[], riskDecision: RiskDecision): TradeIntent | undefined {
  const approved = ideas.find((idea) =>
    riskDecision.approvedTradeFingerprint?.includes(idea.id),
  );
  return approved ?? ideas[1] ?? ideas[0];
}

export function buildAgentWorkbench(input: AgentWorkbenchInput): AgentWorkbenchResult {
  const strongest = strongestMomentum(input.markets);
  const idea = selectedIdea(input.ideas, input.riskDecision);
  const riskTone = input.riskDecision.approved ? "approved" : "vetoed";
  const base = {
    mode: input.reasoning.mode,
    model: input.reasoning.model,
  };

  return {
    ...base,
    beginnerExplanation:
      "The workbench splits one trade review into four specialist views: market context, risk approval, execution readiness, and journal evidence. None of these agents can place a live order.",
    runs: [
      {
        ...base,
        role: "market-analyst",
        title: "Market analyst",
        summary:
          strongest
            ? `${strongest.symbol} currently leads the monitored set with ${strongest.change24h.toFixed(2)}% 24h momentum and a ${strongest.signal} signal.`
            : "Market context is unavailable, so the desk should rely on fallback data labels.",
        bullets: [
          strongest
            ? `${strongest.name} is the strongest momentum asset in the current snapshot.`
            : "No market leader was available in the current snapshot.",
          "Compare momentum with volume, risk label, and thesis before promoting an idea.",
          input.reasoning.bullets[0] ?? "Use the latest market snapshot as context, not as a standalone signal.",
        ],
        confidence: strongest ? 0.72 : 0.44,
        action: "Refresh watchlist data, then compare the leader against the selected idea.",
        safetyNote: "Market strength is not permission to execute; it only informs the review.",
      },
      {
        ...base,
        role: "risk-manager",
        title: "Risk manager agent",
        summary: `The Risk Manager ${riskTone} the selected idea with a score of ${input.riskDecision.score}/100.`,
        bullets: [
          formatRiskReasons(input.riskDecision),
          input.riskDecision.approved
            ? "The exact approved trade fingerprint must match before any execution path is considered."
            : "Execution remains blocked until the veto reason is removed and the trade is re-evaluated.",
          "Position size, stop loss, product flag, and drawdown limits remain mandatory checks.",
        ],
        confidence: input.riskDecision.approved ? 0.83 : 0.9,
        action: input.riskDecision.approved
          ? "Allow paper execution only unless every live-trading guard also passes."
          : "Keep execution blocked and revise the trade ticket.",
        safetyNote: "This agent has veto authority in the command center.",
      },
      {
        ...base,
        role: "execution-coach",
        title: "Execution coach",
        summary: idea
          ? `${idea.symbol} ${idea.side} remains a paper-first setup; live trading is locked by default.`
          : "No executable idea is selected, so there is no ticket to prepare.",
        bullets: [
          idea
            ? `Prepare a ${idea.product} paper ticket for ${idea.quantity} ${idea.symbol} with entry ${idea.entryPrice}.`
            : "Select or draft a trade idea before execution planning.",
          "Live execution still requires admin permission, manual confirmation, product enablement, credentials, and exact risk approval.",
          "Use the paper ticket preview to inspect notional exposure, stop risk, and reward-to-risk.",
        ],
        confidence: idea ? 0.78 : 0.36,
        action: idea ? "Sync the selected idea into the paper order ticket." : "Select an idea first.",
        safetyNote: "The execution coach is advisory and cannot bypass live-trading guards.",
      },
      {
        ...base,
        role: "journal-coach",
        title: "Journal coach",
        summary:
          "The audit trail should capture the market read, risk decision, execution choice, and follow-up review.",
        bullets: [
          idea
            ? `Log why ${idea.symbol} was reviewed, including the thesis and confidence ${Math.round(idea.confidence * 100)}%.`
            : "Log why no trade was selected if the desk stays flat.",
          "Record veto reasons or exact approval fingerprints, not just the final decision.",
          "After paper close, compare forecast confidence with realized P&L for calibration.",
        ],
        confidence: 0.8,
        action: "Add a journal note before and after paper execution.",
        safetyNote: "Good logs make the next agent run more useful and easier to audit.",
      },
    ],
  };
}
