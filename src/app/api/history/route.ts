import { NextRequest, NextResponse } from "next/server";
import { fetchKlines } from "@/lib/binance";
import { CHART_CANDLES, normalizeClosed } from "@/lib/candles";
import { DEFAULT_INTERVAL, parseInterval } from "@/lib/intervals";

/** Binance blocks US datacenter IPs — run close to LATAM/EU */
export const preferredRegion = ["gru1", "fra1", "cdg1"];


export async function GET(request: NextRequest) {
  const interval = parseInterval(
    request.nextUrl.searchParams.get("interval"),
    DEFAULT_INTERVAL
  );

  try {
    const candles = normalizeClosed(await fetchKlines(interval, CHART_CANDLES));
    return NextResponse.json({ interval, candles, updatedAt: Date.now() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/history]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
