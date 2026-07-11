import { NextRequest, NextResponse } from "next/server";
import { fetchKlines, fetchMarkPrice } from "@/lib/binance";
import { DEFAULT_INTERVAL, INTERVALS, parseInterval } from "@/lib/intervals";

/** Binance blocks US datacenter IPs — run close to LATAM/EU */
export const preferredRegion = ["gru1", "fra1", "cdg1"];

export async function GET(request: NextRequest) {
  const interval = parseInterval(
    request.nextUrl.searchParams.get("interval"),
    DEFAULT_INTERVAL
  );

  if (!INTERVALS.includes(interval)) {
    return NextResponse.json({ error: "Invalid interval" }, { status: 400 });
  }

  try {
    const [price, klines] = await Promise.all([
      fetchMarkPrice(),
      fetchKlines(interval, 5),
    ]);

    return NextResponse.json({
      price,
      candles: klines,
      updatedAt: Date.now(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[api/tick]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
