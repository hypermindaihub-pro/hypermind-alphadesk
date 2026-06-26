import { NextResponse } from "next/server";
import { getMarketData } from "@/lib/coingecko";

export const dynamic = "force-dynamic";

export async function GET() {
  const marketData = await getMarketData();

  return NextResponse.json(marketData);
}
