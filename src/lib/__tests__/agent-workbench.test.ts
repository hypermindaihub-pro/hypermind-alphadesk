import { describe, expect, it } from "vitest";
import { buildAgentWorkbench } from "../agent-workbench";
import type { AgentReasoning } from "../openai-agent";
import { evaluateRisk } from "../risk-manager";
import { fallbackMarkets, seedPortfolio, seedTradeIdeas } from "../sample-data";

const reasoning: AgentReasoning = {
  mode: "deterministic-fallback",
  model: "gpt-test",
  summary: "Risk-first summary",
  bullets: ["ETH has the strongest 24h momentum.", "Prefer paper execution."],
};

describe("agent workbench", () => {
  it("creates distinct specialist agent runs without leaking secrets", () => {
    const workbench = buildAgentWorkbench({
      ideas: seedTradeIdeas,
      markets: fallbackMarkets,
      reasoning,
      riskDecision: evaluateRisk(seedTradeIdeas[1], seedPortfolio),
    });

    expect(workbench.runs).toHaveLength(4);
    expect(workbench.runs.map((run) => run.role)).toEqual([
      "market-analyst",
      "risk-manager",
      "execution-coach",
      "journal-coach",
    ]);
    expect(workbench.runs.every((run) => run.bullets.length > 0)).toBe(true);
    expect(workbench.beginnerExplanation).toContain("four specialist views");
    expect(JSON.stringify(workbench)).not.toMatch(/secret|api[_-]?key/i);
  });

  it("surfaces risk vetoes as an execution block", () => {
    const vetoedIdea = {
      ...seedTradeIdeas[2],
      leverage: 100,
    };
    const riskDecision = evaluateRisk(vetoedIdea, seedPortfolio);
    const workbench = buildAgentWorkbench({
      ideas: [vetoedIdea],
      markets: fallbackMarkets,
      reasoning,
      riskDecision,
    });
    const riskAgent = workbench.runs.find((run) => run.role === "risk-manager");

    expect(riskAgent?.summary).toContain("vetoed");
    expect(riskAgent?.action).toContain("blocked");
    expect(riskAgent?.bullets.join(" ")).toContain("Leverage");
  });
});
