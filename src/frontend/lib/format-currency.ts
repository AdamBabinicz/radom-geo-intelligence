import type { Locale } from '@/src/locales'

const PLN_PER_USD = 4

export function formatPriceFromPln(amountInPln: number, locale: Locale) {
  const isPolish = locale === 'pl'
  return new Intl.NumberFormat(isPolish ? 'pl-PL' : 'en-US', {
    style: 'currency',
    currency: isPolish ? 'PLN' : 'USD',
    maximumFractionDigits: 0,
  }).format(isPolish ? amountInPln : amountInPln / PLN_PER_USD)
}
