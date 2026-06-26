import { describe, expect, it } from "vitest";
import { getAlphaConfig } from "../config";
import { estimateAgentCost } from "../cost-control";
import type { LaunchReadinessSnapshot } from "../launch-readiness";
import {
  buildOperatorBrief,
  type OperatorView,
} from "../operator-brief";
import { evaluateRisk } from "../risk-manager";
import { seedPaperPositions, seedPortfolio, seedTradeIdeas } from "../sample-data";
import type { MarketDataStatus } from "../types";

const selectedIdea = seedTradeIdeas[1];
const config = getAlphaConfig({});
const riskDecision = evaluateRisk(selectedIdea, seedPortfolio, config);
const marketStatus: MarketDataStatus = {
  cacheAgeMs: 0,
  fetchedAt: "2026-06-04T00:00:00.000Z",
  freshness: "fresh",
  message: "Fresh CoinGecko data.",
  provider: "CoinGecko",
  source: "coingecko",
};
const launchReadiness: LaunchReadinessSnapshot = {
  beginnerExplanation: "Ready for paper operation.",
  blockers: ["LIVE_TRADING_ENABLED is not true."],
  checkedAt: "2026-06-04T00:00:00.000Z",
  checks: [],
  liveExecutionAllowed: false,
  liveTradingEnabled: false,
  paperTradingEnabled: true,
  requiredManualConfirmation: "CONFIRM LIVE TRADE",
  score: 72,
  status: "paper-ready",
  warnings: [],
};

function briefFor(view: OperatorView) {
  return buildOperatorBrief({
    costUsage: estimateAgentCost(1000, 250, 0, config),
    journalCount: 3,
    launchReadiness,
    marketStatus,
    openPositions: seedPaperPositions,
    riskDecision,
    selectedIdea,
    view,
  });
}

describe("operator route briefs", () => {
  it("gives every command-center route a distinct workstation brief", () => {
    const views: OperatorView[] = [
      "dashboard",
      "watchlist",
      "agents",
      "trade-ideas",
      "risk",
      "paper-trading",
      "journal",
      "reports",
      "settings",
      "system-health",
      "cost-control",
    ];
    const titles = new Set(views.map((view) => briefFor(view).title));

    expect(titles.size).toBe(views.length);
    expect(briefFor("agents").summary).toContain("OpenAI");
    expect(briefFor("paper-trading").safetyNote).toContain("does not call MEXC");
  });

  it("surfaces risk and launch evidence in the risk workstation", () => {
    const brief = briefFor("risk");

    expect(brief.title).toBe("Risk command workstation");
    expect(brief.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Risk", value: "approved" }),
        expect.objectContaining({ label: "Launch", value: "paper-ready" }),
        expect.objectContaining({ label: "Blockers", value: "1" }),
      ]),
    );
  });

  it("labels stale market data as a warning on the watchlist route", () => {
    const brief = buildOperatorBrief({
      costUsage: estimateAgentCost(1000, 250, 0, config),
      journalCount: 3,
      launchReadiness,
      marketStatus: { ...marketStatus, freshness: "stale", source: "cache" },
      openPositions: seedPaperPositions,
      riskDecision,
      selectedIdea,
      view: "watchlist",
    });

    expect(brief.evidence[0]).toMatchObject({
      label: "Market data",
      tone: "amber",
      value: "stale",
    });
  });
});
