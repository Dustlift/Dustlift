import { NextRequest, NextResponse } from "next/server";
import { fetchSwapQuote } from "@/lib/swap";

export async function GET(request: NextRequest) {
  const sellToken = request.nextUrl.searchParams.get("sellToken");
  const buyToken = request.nextUrl.searchParams.get("buyToken");
  const sellAmount = request.nextUrl.searchParams.get("sellAmount");
  const taker = request.nextUrl.searchParams.get("taker");

  if (!sellToken || !sellAmount || !taker) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  if (!process.env.ZEROX_API_KEY) {
    return NextResponse.json(
      { error: "ZEROX_API_KEY not configured" },
      { status: 503 },
    );
  }

  const quote = await fetchSwapQuote({
    sellToken,
    buyToken: buyToken ?? undefined,
    sellAmount,
    takerAddress: taker,
  });

  if (!quote) {
    return NextResponse.json({ error: "No quote available" }, { status: 404 });
  }

  return NextResponse.json(quote);
}
