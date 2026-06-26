import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE_NAME,
  getAccessConfig,
  verifyAccessSession,
} from "@/lib/access-control";
import { MANUAL_CONFIRMATION_PHRASE } from "@/lib/execution-guards";
import { submitGuardedMexcOrder } from "@/lib/mexc";
import { evaluateRisk } from "@/lib/risk-manager";
import { appendServerAuditEvent } from "@/lib/server-audit-log";
import { classifyLiveOrderFailure } from "@/lib/live-order-diagnostics";
import { seedPortfolio, seedTradeIdeas } from "@/lib/sample-data";
import type { TradeIntent } from "@/lib/types";

export const dynamic = "force-dynamic";

type LiveOrderRequest = Partial<TradeIntent> & {
  manualConfirmation?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as LiveOrderRequest;
  const accessConfig = getAccessConfig();
  const session = await verifyAccessSession(
    request.cookies.get(ACCESS_COOKIE_NAME)?.value,
    accessConfig.sessionSecret,
  );
  const adminPermission = session.valid && session.role === "admin";
  const trade: TradeIntent = {
    ...seedTradeIdeas[1],
    ...body,
  };
  const riskDecision = evaluateRisk(trade, seedPortfolio);
  const result = await submitGuardedMexcOrder({
    trade,
    riskDecision,
    adminPermission,
    manualConfirmation: body.manualConfirmation ?? "",
  });
  const diagnostic = result.submitted
    ? null
    : classifyLiveOrderFailure(result.reasons);
  const status = result.submitted ? 200 : 403;

  await appendServerAuditEvent({
    actor: "risk-manager",
    event: result.submitted ? "live-order-submitted" : "live-order-rejected",
    metadata: {
      adminPermission,
      reasonCount: result.reasons.length,
      rejectionCategory: diagnostic?.category ?? "none",
      riskApproved: riskDecision.approved,
      sessionRole: session.valid ? session.role : "none",
      submitted: result.submitted,
      symbol: trade.symbol,
      testnet: result.testnet,
    },
    route: "/api/live-order",
    summary: result.submitted
      ? `Live order submitted for ${trade.symbol}.`
      : `Live order rejected for ${trade.symbol}.`,
  });

  return NextResponse.json(
    {
      submitted: result.submitted,
      exchange: result.exchange,
      testnet: result.testnet,
      reasons: result.reasons,
      diagnostic,
      order: result.order,
      sessionRole: session.valid ? session.role : null,
      riskApproved: riskDecision.approved,
      requiredManualConfirmation: MANUAL_CONFIRMATION_PHRASE,
    },
    { status },
  );
}
