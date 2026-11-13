import type { Locale } from "@/src/locales";

const PLN_PER_USD = 4;

export function convertFromPln(amountPln: number, locale: Locale): number {
  if (locale === "pl") return Math.round(amountPln);
  const usd = amountPln / PLN_PER_USD;
  if (usd < 5) return Number(usd.toFixed(2));
  return Math.round(usd);
}

export function formatCurrencyValue(amount: number, locale: Locale): string {
  const hasFraction =
    amount < 10 && Math.abs(amount - Math.round(amount)) > 0.01;
  if (locale === "en") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: hasFraction ? 2 : 0,
    }).format(amount);
  }

  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPrice(amountPln: number, locale: Locale): string {
  return formatCurrencyValue(convertFromPln(amountPln, locale), locale);
}
