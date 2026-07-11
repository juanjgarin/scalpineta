import { NextRequest, NextResponse } from "next/server";
import { fetchKlines, fetchMarkPrice } from "@/lib/binance";
import type { Interval } from "@/lib/types";

/** Binance blocks US datacenter IPs — run close to LATAM/EU */
export const preferredRegion = ["gru1", "fra1", "cdg1"];

const VALID: Interval[] = ["1m", "5m", "15m"];

export async function GET(request: NextRequest) {
  const interval = (request.nextUrl.searchParams.get("interval") ??
    "5m") as Interval;

  if (!VALID.includes(interval)) {
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
