import { NextResponse } from "next/server";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { getPublicFeeConfig } from "@/lib/fees";

export async function GET() {
  const fee = getPublicFeeConfig();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://your-domain.vercel.app";

  return NextResponse.json({
    appName: APP_NAME,
    tagline: APP_TAGLINE,
    appUrl,
    fee,
    baseAppReady: true,
    registration: {
      platform: "https://base.dev",
      steps: [
        "Deploy to Vercel with NEXT_PUBLIC_APP_URL set to production URL",
        "Create project at base.dev",
        "Fill metadata: name, icon, tagline, screenshots, category DeFi",
        "Set primary URL to your deployed domain",
        "Add builder code from your Base.dev profile",
      ],
    },
  } satisfies Record<string, unknown>);
}
