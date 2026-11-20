import type { Locale } from "@/src/locales";

interface LocaleCurrencyConfig {
  intlLocale: string;
  currency: string;
  plnPerUnit: number;
  allowSmallFractions: boolean;
}

const LOCALE_CURRENCY_CONFIG: Record<Locale, LocaleCurrencyConfig> = {
  en: {
    intlLocale: "en-US",
    currency: "USD",
    plnPerUnit: 4,
    allowSmallFractions: true,
  },
  pl: {
    intlLocale: "pl-PL",
    currency: "PLN",
    plnPerUnit: 1,
    allowSmallFractions: false,
  },
};

export function convertFromPln(amountPln: number, locale: Locale): number {
  const { plnPerUnit, allowSmallFractions } = LOCALE_CURRENCY_CONFIG[locale];
  const converted = amountPln / plnPerUnit;
  if (allowSmallFractions && converted < 5) {
    return Number(converted.toFixed(2));
  }
  return Math.round(converted);
}

export function formatCurrencyValue(amount: number, locale: Locale): string {
  const { intlLocale, currency, allowSmallFractions } =
    LOCALE_CURRENCY_CONFIG[locale];
  const hasFraction =
    allowSmallFractions &&
    amount < 10 &&
    Math.abs(amount - Math.round(amount)) > 0.01;
  const fractionDigits = hasFraction ? 2 : 0;

  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

export function formatPrice(amountPln: number, locale: Locale): string {
  return formatCurrencyValue(convertFromPln(amountPln, locale), locale);
}
