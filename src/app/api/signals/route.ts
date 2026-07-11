import { NextRequest, NextResponse } from "next/server";
import { fetchKlines, fetchMarkPrice } from "@/lib/binance";
import { normalizeClosed, trimCandles } from "@/lib/candles";
import { detectSignals } from "@/lib/patterns";
import type { Interval, SignalsResponse } from "@/lib/types";

/** Binance blocks US datacenter IPs — run close to LATAM/EU */
export const preferredRegion = ["gru1", "fra1", "cdg1"];

const VALID_INTERVALS: Interval[] = ["1m", "5m", "15m"];

export async function GET(request: NextRequest) {
  const interval = (request.nextUrl.searchParams.get("interval") ??
    "5m") as Interval;

  if (!VALID_INTERVALS.includes(interval)) {
    return NextResponse.json(
      { error: "Invalid interval. Use 1m, 5m or 15m." },
      { status: 400 }
    );
  }

  try {
    const [candles, price] = await Promise.all([
      fetchKlines(interval),
      fetchMarkPrice(),
    ]);

    const allCandles = normalizeClosed(candles);
    const signals = detectSignals(allCandles);

    const body: SignalsResponse = {
      symbol: "BTCUSDT",
      interval,
      price,
      updatedAt: Date.now(),
      candles: trimCandles(allCandles),
      signals,
      latest: signals[0] ?? null,
    };

    return NextResponse.json(body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[api/signals]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
