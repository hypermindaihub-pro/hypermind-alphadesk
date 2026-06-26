import type { LaunchReadinessSnapshot } from "./launch-readiness";
import type { CostUsage, MarketDataStatus, PaperPosition, RiskDecision, TradeIntent } from "./types";

export type OperatorView =
  | "dashboard"
  | "watchlist"
  | "agents"
  | "trade-ideas"
  | "risk"
  | "paper-trading"
  | "journal"
  | "reports"
  | "settings"
  | "system-health"
  | "cost-control";

export type OperatorBriefInput = {
  costUsage: CostUsage;
  journalCount: number;
  launchReadiness: LaunchReadinessSnapshot;
  marketStatus: MarketDataStatus;
  openPositions: PaperPosition[];
  riskDecision: RiskDecision;
  selectedIdea: TradeIntent;
  view: OperatorView;
};

export type OperatorBrief = {
  title: string;
  summary: string;
  primaryAction: string;
  safetyNote: string;
  evidence: Array<{
    label: string;
    value: string;
    tone: "green" | "amber" | "red" | "neutral";
  }>;
};

function riskTone(riskDecision: RiskDecision): "green" | "red" {
  return riskDecision.approved ? "green" : "red";
}

function launchTone(
  launchReadiness: LaunchReadinessSnapshot,
): "green" | "amber" | "red" {
  if (launchReadiness.status === "live-ready") {
    return "green";
  }

  if (launchReadiness.status === "paper-ready") {
    return "amber";
  }

  return "red";
}

export function buildOperatorBrief(input: OperatorBriefInput): OperatorBrief {
  const baseEvidence: OperatorBrief["evidence"] = [
    {
      label: "Selected idea",
      tone: "neutral",
      value: `${input.selectedIdea.symbol} ${input.selectedIdea.side}`,
    },
    {
      label: "Risk",
      tone: riskTone(input.riskDecision),
      value: input.riskDecision.approved ? "approved" : "veto",
    },
    {
      label: "Launch",
      tone: launchTone(input.launchReadiness),
      value: input.launchReadiness.status,
    },
  ];

  switch (input.view) {
    case "watchlist":
      return {
        evidence: [
          {
            label: "Market data",
            tone: input.marketStatus.freshness === "fresh" ? "green" : "amber",
            value: input.marketStatus.freshness,
          },
          ...baseEvidence,
        ],
        primaryAction: "Compare signals against the selected trade idea.",
        safetyNote: "Freshness labels matter: stale or fallback prices should never be treated as execution-grade data.",
        summary: "Use this workstation to inspect real CoinGecko context before promoting a setup into Risk Manager review.",
        title: "Market intelligence workstation",
      };
    case "agents":
      return {
        evidence: [
          {
            label: "Cost gate",
            tone: input.costUsage.allowed ? "green" : "red",
            value: input.costUsage.allowed ? "ready" : "blocked",
          },
          ...baseEvidence,
        ],
        primaryAction: "Run agent reasoning, then journal the thesis or rejection.",
        safetyNote: "Agent output can suggest ideas, but it cannot approve risk or submit live orders.",
        summary: "Use this workstation for OpenAI-backed reasoning with deterministic fallback and budget protection.",
        title: "Agent reasoning workstation",
      };
    case "trade-ideas":
      return {
        evidence: baseEvidence,
        primaryAction: "Create or select an idea, then send it through Risk Manager.",
        safetyNote: "Every edit changes the exact trade fingerprint, so risk approval must be recomputed.",
        summary: "Use this workstation to shape long/short spot or derivatives ideas before execution gates see them.",
        title: "Trade idea workstation",
      };
    case "risk":
      return {
        evidence: [
          ...baseEvidence,
          {
            label: "Blockers",
            tone: input.launchReadiness.blockers.length ? "red" : "green",
            value: String(input.launchReadiness.blockers.length),
          },
        ],
        primaryAction: "Resolve vetoes and live blockers before any execution probe.",
        safetyNote: "Live execution still rejects unless every server-side guard passes for this exact trade.",
        summary: "Use this workstation to inspect exact Risk Manager approval, live guard state, and readiness blockers.",
        title: "Risk command workstation",
      };
    case "paper-trading":
      return {
        evidence: [
          {
            label: "Open positions",
            tone: input.openPositions.length ? "green" : "neutral",
            value: String(input.openPositions.length),
          },
          ...baseEvidence,
        ],
        primaryAction: "Open or close simulated positions and review P&L impact.",
        safetyNote: "Paper trading is local simulation only; it does not call MEXC.",
        summary: "Use this workstation to practice the selected setup with long/short paper positions.",
        title: "Paper execution workstation",
      };
    case "journal":
      return {
        evidence: [
          {
            label: "Audit rows",
            tone: input.journalCount ? "green" : "amber",
            value: String(input.journalCount),
          },
          ...baseEvidence,
        ],
        primaryAction: "Record why a setup was taken, skipped, vetoed, or reviewed.",
        safetyNote: "The journal is private browser state unless exported through the encrypted vault.",
        summary: "Use this workstation as the append-only operating memory for the desk.",
        title: "Audit journal workstation",
      };
    case "reports":
      return {
        evidence: baseEvidence,
        primaryAction: "Review paper P&L, calibration, reconciliation, and readiness trends.",
        safetyNote: "Reports summarize local desk state and should be exported before clearing browser storage.",
        summary: "Use this workstation to convert current activity into operating review evidence.",
        title: "Reporting workstation",
      };
    case "settings":
      return {
        evidence: baseEvidence,
        primaryAction: "Review runtime posture, storage mode, and secret-readiness booleans.",
        safetyNote: "Settings display safe flags only; secret values are never printed client-side.",
        summary: "Use this workstation to manage private storage, vault export/import, and server posture.",
        title: "Private settings workstation",
      };
    case "system-health":
      return {
        evidence: [
          {
            label: "Launch",
            tone: launchTone(input.launchReadiness),
            value: input.launchReadiness.status,
          },
          {
            label: "Market data",
            tone: input.marketStatus.freshness === "fresh" ? "green" : "amber",
            value: input.marketStatus.freshness,
          },
          {
            label: "Cost gate",
            tone: input.costUsage.allowed ? "green" : "red",
            value: input.costUsage.allowed ? "ready" : "blocked",
          },
        ],
        primaryAction: "Run reconciliation and review account diagnostics before launch decisions.",
        safetyNote: "Health checks are evidence, not permission to trade live.",
        summary: "Use this workstation to inspect operational readiness across providers, auth, costs, and exchange posture.",
        title: "System health workstation",
      };
    case "cost-control":
      return {
        evidence: [
          {
            label: "Cost gate",
            tone: input.costUsage.allowed ? "green" : "red",
            value: input.costUsage.allowed ? "within budget" : "blocked",
          },
          ...baseEvidence,
        ],
        primaryAction: "Estimate AI usage before running expensive reasoning loops.",
        safetyNote: "Cost blocks prevent runaway agent calls but do not change trading risk.",
        summary: "Use this workstation to keep OpenAI reasoning inside a private daily budget.",
        title: "Cost control workstation",
      };
    case "dashboard":
    default:
      return {
        evidence: baseEvidence,
        primaryAction: "Start with market context, run reasoning, then review risk and launch readiness.",
        safetyNote: "Dashboard actions stay paper-first while live trading is off by default.",
        summary: "Use this workstation as the high-level operating picture for the private desk.",
        title: "Mission control workstation",
      };
  }
}
