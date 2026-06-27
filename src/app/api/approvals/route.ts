import { NextRequest, NextResponse } from "next/server";
import { fetchWalletApprovals } from "@/lib/approvals";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const approvals = await fetchWalletApprovals(address);
    return NextResponse.json({
      approvals: approvals.map((a) => ({
        ...a,
        value: a.value.toString(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Approval scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
