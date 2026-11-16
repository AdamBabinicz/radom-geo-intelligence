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
    "GeoIntelligence & Service Operations Hub for local service businesses: live website pricing extraction, competitor discovery, dynamic radius quoting (10–100 km), Multi-Model AI Council, and Atlassian Forge Rovo/MCP automation.",
  applicationName: "Northstar Ops",
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
    images: [
      {
        url: "/apple-icon.png",
        width: 180,
        height: 180,
        alt: "Northstar Ops logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Northstar Ops | GeoIntelligence & Service Operations Hub",
    description:
      "Local market analysis, live competitor discovery, Multi-Model AI Council, and Atlassian Forge Rovo/MCP workflows.",
    images: ["/apple-icon.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
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
