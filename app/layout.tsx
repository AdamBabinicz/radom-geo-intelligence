import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://nsops.vercel.app";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Northstar Ops | GeoIntelligence & Service Operations Hub",
    template: "%s | Northstar Ops",
  },
  description:
    "GeoIntelligence Hub for local service businesses: live pricing sync, AI competitor discovery, 10-100 km quoting & Atlassian Forge Rovo/MCP automation.",
  applicationName: "Northstar Ops",
  manifest: "/site.webmanifest",
  keywords: [
    "GeoIntelligence",
    "Local Market Analysis",
    "Dynamic Radius Pricing",
    "Atlassian Forge",
    "Rovo Agent",
    "Model Context Protocol",
    "AI Council",
    "Service Operations Hub",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Northstar Ops",
    title: "Northstar Ops | GeoIntelligence & Service Operations Hub",
    description:
      "Live local market intelligence, dynamic 10–100 km radius quoting, Multi-Model AI Council, and native Atlassian Rovo/MCP + Jira & Confluence integration.",
    locale: "en_US",
    alternateLocale: ["pl_PL"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Northstar Ops | GeoIntelligence & Service Operations Hub",
    description:
      "Local market analysis, live competitor discovery, Multi-Model AI Council, and Atlassian Forge Rovo/MCP workflows.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" }],
    shortcut: ["/favicon-96x96.png"],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#101719" },
  ],
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Northstar Ops",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, Atlassian Cloud (Jira, Confluence, Rovo)",
  url: SITE_URL,
  description:
    "GeoIntelligence & Service Operations Hub with live SPA pricing extraction, competitor discovery, Multi-Model AI Council, and Atlassian Forge Rovo/MCP execution.",
  featureList: [
    "Dynamic 10-100 km service radius coverage via OpenStreetMap & Wikidata",
    "Live website pricing extraction and AI competitor benchmarking",
    "Cross-provider Multi-Model AI Council with human-in-the-loop constraints",
    "Atlassian Forge Rovo Agent, Skill & MCP Server for Jira and Confluence",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareApplicationJsonLd),
          }}
        />
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
