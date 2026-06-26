import { NextResponse } from "next/server";
import { buildAgentWorkbench } from "@/lib/agent-workbench";
import { getMarketData } from "@/lib/coingecko";
import { estimateAgentCost } from "@/lib/cost-control";
import { generateAgentReasoning } from "@/lib/openai-agent";
import { evaluateRisk } from "@/lib/risk-manager";
import { appendServerAuditEvent } from "@/lib/server-audit-log";
import { seedPortfolio, seedTradeIdeas } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

export async function POST() {
  const marketData = await getMarketData();
  const riskDecision = evaluateRisk(seedTradeIdeas[1], seedPortfolio);
  const costUsage = estimateAgentCost(1800, 450);

  if (!costUsage.allowed) {
    await appendServerAuditEvent({
      actor: "agent",
      event: "agent-cost-blocked",
      metadata: {
        allowed: false,
        estimatedCostUsd: costUsage.estimatedCostUsd,
        model: costUsage.model,
      },
      route: "/api/agents",
      summary: "Agent reasoning blocked by cost control.",
    });
    return NextResponse.json(
      {
        mode: "blocked",
        costUsage,
        message: costUsage.message,
      },
      { status: 429 },
    );
  }

  const reasoning = await generateAgentReasoning({
    markets: marketData.assets,
    ideas: seedTradeIdeas,
    riskDecision,
  });
  const workbench = buildAgentWorkbench({
    markets: marketData.assets,
    ideas: seedTradeIdeas,
    reasoning,
    riskDecision,
  });

  await appendServerAuditEvent({
    actor: "agent",
    event: "agent-reasoning",
    metadata: {
      allowed: costUsage.allowed,
      estimatedCostUsd: costUsage.estimatedCostUsd,
      runCount: workbench.runs.length,
      mode: reasoning.mode,
      model: reasoning.model,
    },
    route: "/api/agents",
    summary: `Agent reasoning completed in ${reasoning.mode} mode.`,
  });

  return NextResponse.json({ reasoning, workbench, costUsage });
}
