import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { AnalyticsConsentGate } from '@/src/frontend/components/features/legal/analytics-consent-gate'
import { CookieBanner } from '@/src/frontend/components/features/legal/cookie-banner'
import { ScrollToTop } from '@/src/frontend/components/ui/scroll-to-top'
import './globals.css'

export const metadata: Metadata = {
  title: 'GeoIntelligence Hub | Radom Service Operations',
  description: 'Local market intelligence, service coverage, competitor benchmarking, and customer pricing preview for the Radom region.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Script id="consent-defaults" strategy="beforeInteractive">
          {`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};window.gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',functionality_storage:'granted',security_storage:'granted'});window.dataLayer.push({event:'consent_update',analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',functionality_storage:'granted',security_storage:'granted'})`}
        </Script>
        {children}
        <CookieBanner />
        <ScrollToTop />
        <AnalyticsConsentGate />
      </body>
    </html>
  )
}
