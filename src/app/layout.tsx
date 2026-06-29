import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { Providers } from "@/components/providers";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["italic", "normal"],
});

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://base-dust-sweep.vercel.app";

const baseAppId = "6a3f13295e3e3d1418bc2d18";

export const metadata: Metadata = {
  title: `${APP_NAME} - ${APP_TAGLINE}`,
  description:
    "Scan Base wallet dust and scam tokens, batch-convert to ETH, swap assets, and view Base wallet activity.",
  metadataBase: new URL(appUrl),
  openGraph: {
    title: APP_NAME,
    description: APP_TAGLINE,
    url: appUrl,
    siteName: APP_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_TAGLINE,
  },
  other: {
    "base:app_id": baseAppId,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1410",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
