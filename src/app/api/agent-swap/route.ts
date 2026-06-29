import { NextRequest, NextResponse } from "next/server";

type AgentToken = {
  address: string;
  symbol: string;
};

type AgentRequest = {
  prompt?: string;
  tokens?: AgentToken[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePrompt(value: string): string {
  return value
    .replace(/,/g, ".")
    .replace(/→|⇒|=>/g, " -> ")
    .replace(/\s+/g, " ")
    .trim();
}

function findTokenMentions(prompt: string, tokens: AgentToken[]) {
  const mentions: { token: AgentToken; index: number }[] = [];
  const lower = prompt.toLowerCase();

  for (const token of tokens) {
    const symbol = token.symbol.toLowerCase();
    if (!symbol) continue;

    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(symbol)}([^a-z0-9]|$)`, "i");
    const match = lower.match(pattern);
    if (match?.index != null) {
      mentions.push({
        token,
        index: match.index + (match[1] ? match[1].length : 0),
      });
    }
  }

  return mentions.sort((a, b) => a.index - b.index);
}

function findAmountToken(prompt: string, tokens: AgentToken[]) {
  for (const token of tokens) {
    const pattern = new RegExp(
      `(\\d+(?:\\.\\d+)?)\\s*${escapeRegExp(token.symbol)}`,
      "i",
    );
    const match = prompt.match(pattern);
    if (match) {
      return {
        amount: match[1],
        token,
      };
    }
  }

  const looseAmount = prompt.match(/\d+(?:\.\d+)?/);
  return looseAmount ? { amount: looseAmount[0], token: null } : null;
}

function parseAgentSwap(prompt: string, tokens: AgentToken[]) {
  const normalized = normalizePrompt(prompt);
  const mentions = findTokenMentions(normalized, tokens);
  const amountToken = findAmountToken(normalized, tokens);
  const useMax = /\b(max|maks|maximum|hepsi|tüm|tum|all)\b/i.test(normalized);

  if (!amountToken?.amount && !useMax) {
    throw new Error("Amount missing. Example: 0.001 ETH ile USDC al.");
  }

  let sellToken = amountToken?.token ?? mentions[0]?.token ?? null;
  let buyToken =
    mentions
      .map((mention) => mention.token)
      .find(
        (token) =>
          sellToken && token.address.toLowerCase() !== sellToken.address.toLowerCase(),
      ) ?? null;

  if (!sellToken && mentions.length >= 2) {
    sellToken = mentions[0].token;
    buyToken = mentions[1].token;
  }

  if (!sellToken) {
    throw new Error("Sell token missing. Example: 5 USDC sat ETH al.");
  }

  if (!buyToken) {
    buyToken = tokens.find((token) => token.symbol.toUpperCase() === "ETH") ?? null;
  }

  if (!buyToken) {
    throw new Error("Buy token missing. Example: ETH ile USDC al.");
  }

  if (sellToken.address.toLowerCase() === buyToken.address.toLowerCase()) {
    throw new Error("Sell and buy token must be different.");
  }

  return {
    sellToken,
    buyToken,
    amount: amountToken?.amount ?? null,
    useMax,
    summary: `${useMax ? "Max" : amountToken?.amount} ${sellToken.symbol} -> ${buyToken.symbol}`,
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AgentRequest;
  const prompt = body.prompt?.trim() ?? "";
  const tokens = (body.tokens ?? []).filter(
    (token) => token.symbol && token.address,
  );

  if (!prompt) {
    return NextResponse.json({ error: "Prompt missing" }, { status: 400 });
  }

  if (tokens.length < 2) {
    return NextResponse.json(
      { error: "Token context missing" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(parseAgentSwap(prompt, tokens));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not parse command" },
      { status: 400 },
    );
  }
}
