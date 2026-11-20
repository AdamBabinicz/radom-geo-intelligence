import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://nsops.vercel.app";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID?.trim() || "GTM-N5JRS6FH";

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
    default: "Northstar Ops | Local Service Market & Price Intelligence",
    template: "%s | Northstar Ops",
  },
  description:
    "Live local service market & price intelligence hub: competitor pricing sync, 10-100 km quoting, Multi-AI Council & Atlassian Forge Rovo/MCP workflows.",
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
    title: "Northstar Ops | Local Service Market & Price Intelligence",
    description:
      "Live local service market & price intelligence hub with 10–100 km radius quoting, Multi-Model AI Council, and Atlassian Forge Rovo/MCP automation.",
    locale: "en_US",
    alternateLocale: ["pl_PL"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Northstar Ops | Local Service Market & Price Intelligence",
    description:
      "Local service market analysis, live competitor price discovery, Multi-AI Council, and Atlassian Forge Rovo/MCP workflows.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      {
        url: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
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

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Northstar Ops",
  url: SITE_URL,
  logo: `${SITE_URL}/web-app-manifest-512x512.png`,
  description:
    "GeoIntelligence & Service Operations platform for local service businesses and Atlassian Forge / Rovo MCP workflows.",
  sameAs: ["https://github.com/AdamBabinicz/radom-geo-intelligence"],
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Northstar Ops",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, Atlassian Cloud (Jira, Confluence, Rovo)",
  url: SITE_URL,
  publisher: {
    "@type": "Organization",
    name: "Northstar Ops",
    url: SITE_URL,
  },
  description:
    "GeoIntelligence & Service Operations Hub with live SPA pricing extraction, competitor discovery, Multi-Model AI Council, and Atlassian Forge Rovo/MCP execution.",
  featureList: [
    "Dynamic 10-100 km service radius coverage via OpenStreetMap & Wikidata",
    "Live website pricing extraction and AI competitor benchmarking",
    "Cross-provider Multi-Model AI Council with human-in-the-loop constraints",
    "Atlassian Forge Rovo Agent, Skill & MCP Server for Jira and Confluence",
  ],
};

const gtmInitScript = `
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);};
window.gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500
});
window.gtag('js', new Date());
window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
`;

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
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            title="Google Tag Manager"
            className="hidden"
          />
        </noscript>
        <Script
          id="gtm-consent-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: gtmInitScript }}
        />
        <Script
          id="gtm-loader"
          src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`}
          strategy="afterInteractive"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
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
