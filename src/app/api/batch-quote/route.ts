import { NextRequest, NextResponse } from "next/server";
import { fetchBatchQuotes } from "@/lib/swap";

export async function POST(request: NextRequest) {
  if (!process.env.ZEROX_API_KEY) {
    return NextResponse.json(
      { error: "ZEROX_API_KEY not configured" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    taker?: string;
    tokens?: { sellToken: string; sellAmount: string }[];
  };

  const { taker, tokens } = body;

  if (!taker || !/^0x[a-fA-F0-9]{40}$/.test(taker)) {
    return NextResponse.json({ error: "Invalid taker address" }, { status: 400 });
  }

  if (!tokens?.length) {
    return NextResponse.json({ error: "No tokens provided" }, { status: 400 });
  }

  if (tokens.length > 25) {
    return NextResponse.json(
      { error: "Maximum 25 tokens per batch" },
      { status: 400 },
    );
  }

  const quotes = await fetchBatchQuotes(taker, tokens);

  return NextResponse.json({
    quotes: quotes.map((q) => q ?? null),
  });
}
