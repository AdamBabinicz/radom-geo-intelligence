'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { CONSENT_UPDATED_EVENT, readConsent, type ConsentChoice } from './consent-storage'

const Analytics = dynamic(() => import('@vercel/analytics/next').then((module) => module.Analytics), { ssr: false })

export function AnalyticsConsentGate() {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    setAllowed(readConsent()?.analytics ?? false)
    const onConsent = (event: Event) => setAllowed((event as CustomEvent<ConsentChoice>).detail.analytics)
    const onStorage = () => setAllowed(readConsent()?.analytics ?? false)
    window.addEventListener(CONSENT_UPDATED_EVENT, onConsent)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CONSENT_UPDATED_EVENT, onConsent)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  if (process.env.NODE_ENV !== 'production' || !allowed) return null
  return <Analytics />
}
