import { NextRequest, NextResponse } from "next/server";
import { fetchKlines, fetchMarkPrice, SYMBOL } from "@/lib/binance";
import { normalizeClosed, trimCandles } from "@/lib/candles";
import { DEFAULT_INTERVAL, INTERVALS, parseInterval } from "@/lib/intervals";
import { detectSignals } from "@/lib/patterns";
import type { SignalsResponse } from "@/lib/types";

/** Binance blocks US datacenter IPs — run close to LATAM/EU */
export const preferredRegion = ["gru1", "fra1", "cdg1"];

export async function GET(request: NextRequest) {
  const interval = parseInterval(
    request.nextUrl.searchParams.get("interval"),
    DEFAULT_INTERVAL
  );

  if (!INTERVALS.includes(interval)) {
    return NextResponse.json(
      { error: "Invalid interval." },
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
      symbol: SYMBOL,
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
