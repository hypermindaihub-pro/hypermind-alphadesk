import { NextResponse } from "next/server";
import { executePaperOrderTicket } from "@/lib/paper-order-ticket";
import { seedTradeIdeas } from "@/lib/sample-data";
import { appendServerAuditEvent } from "@/lib/server-audit-log";
import type { TradeIntent } from "@/lib/types";

type PaperTradeRequest = Partial<TradeIntent> & {
  markPrice?: number;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as PaperTradeRequest;
  const trade: TradeIntent = {
    ...seedTradeIdeas[1],
    ...body,
  };
  const result = executePaperOrderTicket(trade, body.markPrice);

  if (!result.preview.valid) {
    await appendServerAuditEvent({
      actor: "paper-trading",
      event: "paper-ticket-rejected",
      metadata: {
        errorCount: result.preview.errors.length,
        paperOnly: true,
        symbol: result.preview.trade.symbol,
      },
      route: "/api/paper-trading",
      summary: `Rejected invalid paper ticket for ${result.preview.trade.symbol}.`,
    });
    return NextResponse.json(result, { status: 400 });
  }

  await appendServerAuditEvent({
    actor: "paper-trading",
    event: "paper-ticket-open",
    metadata: {
      notionalUsd: result.preview.notionalUsd,
      paperOnly: true,
      riskUsd: result.preview.riskUsd,
      side: result.preview.trade.side,
      symbol: result.preview.trade.symbol,
    },
    route: "/api/paper-trading",
    summary: `Opened paper ticket for ${result.preview.trade.symbol}.`,
  });

  return NextResponse.json(result);
}
