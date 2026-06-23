import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { GoogleAnalytics } from "./analytics";
import "./globals.css";

// Editorial-premium type pairing (ivo-inspired): a soft transitional serif for
// display, a clean grotesk for body/UI. Wired to CSS vars in tokens.css.
const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-runtime",
  axes: ["opsz", "SOFT"],
});

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-runtime",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://burrow.nirnaypatel.com"),
  title: "Burrow — one surface for the whole product org",
  description:
    "The open-source, AI-native workspace where product and engineering — and their agents — share one surface. Context, specs, roadmap, decisions, feedback, and an agent bridge. Self-hosted, on your keys.",
  openGraph: {
    title: "Burrow — one surface for the whole product org",
    description:
      "Bring your context, write and decide on specs together, then let agents ship it. Multiplayer, agentic, open source, BYO keys. Nothing leaves your infrastructure.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
