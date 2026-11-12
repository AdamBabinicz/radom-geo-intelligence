export type ConsentChoice = {
  analytics: boolean
  advertising: boolean
  updatedAt: number
}

const STORAGE_KEY = 'northstar-cookie-consent-v1'
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000
export const CONSENT_UPDATED_EVENT = 'cookie-consent-updated'
export const OPEN_PREFERENCES_EVENT = 'open-cookie-preferences'

export function readConsent(): ConsentChoice | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const choice = JSON.parse(stored) as ConsentChoice
    const valid = typeof choice.analytics === 'boolean' && typeof choice.advertising === 'boolean' && typeof choice.updatedAt === 'number'
    if (!valid || Date.now() - choice.updatedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return choice
  } catch {
    return null
  }
}

export function saveConsent(analytics: boolean, advertising: boolean): ConsentChoice {
  const choice = { analytics, advertising, updatedAt: Date.now() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // Consent remains active for this page session when storage is unavailable.
  }
  return choice
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function publishConsent(choice: ConsentChoice) {
  const analytics = choice.analytics ? 'granted' : 'denied'
  const advertising = choice.advertising ? 'granted' : 'denied'
  const consent = {
    analytics_storage: analytics,
    ad_storage: advertising,
    ad_user_data: advertising,
    ad_personalization: advertising,
    functionality_storage: 'granted',
    security_storage: 'granted',
  }
  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || ((...args) => window.dataLayer?.push(args))
  window.gtag('consent', 'update', consent)
  window.dataLayer.push({ event: 'consent_update', ...consent })
  window.dispatchEvent(new CustomEvent(CONSENT_UPDATED_EVENT, { detail: choice }))
}
