import { NextRequest, NextResponse } from "next/server";
import { fetchKlines, fetchMarkPrice } from "@/lib/binance";
import type { Interval } from "@/lib/types";

const VALID: Interval[] = ["1m", "5m", "15m"];

export async function GET(request: NextRequest) {
  const interval = (request.nextUrl.searchParams.get("interval") ??
    "5m") as Interval;

  if (!VALID.includes(interval)) {
    return NextResponse.json({ error: "Intervalo inválido" }, { status: 400 });
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
      error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
