import type { Locale } from "@/src/locales";

export const SUPPORTED_DISPLAY_CURRENCIES = [
  "PLN",
  "USD",
  "EUR",
  "GBP",
] as const;

export type DisplayCurrency = (typeof SUPPORTED_DISPLAY_CURRENCIES)[number];

export interface LocaleCurrencyConfig {
  intlLocale: string;
  currency: DisplayCurrency;
  plnPerUnit: number;
  allowSmallFractions: boolean;
}

interface CurrencyRateSpec {
  currency: DisplayCurrency;
  plnPerUnit: number;
  allowSmallFractions: boolean;
}

const CURRENCY_RATE_SPECS: Record<DisplayCurrency, CurrencyRateSpec> = {
  PLN: {
    currency: "PLN",
    plnPerUnit: 1,
    allowSmallFractions: false,
  },
  USD: {
    currency: "USD",
    plnPerUnit: 4,
    allowSmallFractions: true,
  },
  EUR: {
    currency: "EUR",
    plnPerUnit: 4.3,
    allowSmallFractions: true,
  },
  GBP: {
    currency: "GBP",
    plnPerUnit: 5,
    allowSmallFractions: true,
  },
};

const LOCALE_INTL_TAGS: Record<string, string> = {
  en: "en-US",
  pl: "pl-PL",
};

const LOCALE_DEFAULT_CURRENCY: Record<string, DisplayCurrency> = {
  en: "USD",
  pl: "PLN",
};

const EUROZONE_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
]);

export function isSupportedDisplayCurrency(
  value: unknown,
): value is DisplayCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_DISPLAY_CURRENCIES as readonly string[]).includes(
      value.trim().toUpperCase(),
    )
  );
}

export function normalizeDisplayCurrency(
  value: unknown,
  fallback: DisplayCurrency = "PLN",
): DisplayCurrency {
  if (typeof value !== "string") return fallback;
  const upper = value.trim().toUpperCase();
  if ((SUPPORTED_DISPLAY_CURRENCIES as readonly string[]).includes(upper)) {
    return upper as DisplayCurrency;
  }
  return fallback;
}

export function resolveLocaleIntlTag(locale: Locale): string {
  const key = String(locale).trim().toLowerCase();
  return LOCALE_INTL_TAGS[key] ?? (key || "en-US");
}

export function resolveMarketCurrency(
  countryCode?: string | null,
  fallbackLocale: Locale = "en",
): DisplayCurrency {
  const code = countryCode?.trim().toUpperCase();
  if (code === "PL") return "PLN";
  if (code === "US") return "USD";
  if (code === "GB" || code === "UK") return "GBP";
  if (code && EUROZONE_COUNTRY_CODES.has(code)) return "EUR";
  const localeKey = String(fallbackLocale).trim().toLowerCase();
  return LOCALE_DEFAULT_CURRENCY[localeKey] ?? "USD";
}

export function getLocaleCurrencyConfig(
  locale: Locale,
  currencyOverride?: DisplayCurrency,
): LocaleCurrencyConfig {
  const localeKey = String(locale).trim().toLowerCase();
  const resolvedCurrency =
    currencyOverride ?? LOCALE_DEFAULT_CURRENCY[localeKey] ?? "USD";
  const spec = CURRENCY_RATE_SPECS[resolvedCurrency] ?? CURRENCY_RATE_SPECS.USD;

  return {
    intlLocale: resolveLocaleIntlTag(locale),
    currency: spec.currency,
    plnPerUnit: spec.plnPerUnit,
    allowSmallFractions: spec.allowSmallFractions,
  };
}

export function convertFromPln(
  amountPln: number,
  locale: Locale,
  currencyOverride?: DisplayCurrency,
): number {
  const { plnPerUnit, allowSmallFractions } = getLocaleCurrencyConfig(
    locale,
    currencyOverride,
  );
  const converted = amountPln / plnPerUnit;
  if (allowSmallFractions && converted < 5) {
    return Number(converted.toFixed(2));
  }
  return Math.round(converted);
}

export function convertToPln(
  amount: number,
  currency: DisplayCurrency,
): number {
  const spec = CURRENCY_RATE_SPECS[currency] ?? CURRENCY_RATE_SPECS.PLN;
  return Math.round(amount * spec.plnPerUnit);
}

export function formatCurrencyValue(
  amount: number,
  locale: Locale,
  currencyOverride?: DisplayCurrency,
): string {
  const { intlLocale, currency, allowSmallFractions } = getLocaleCurrencyConfig(
    locale,
    currencyOverride,
  );
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

export function formatPrice(
  amountPln: number,
  locale: Locale,
  currencyOverride?: DisplayCurrency,
): string {
  return formatCurrencyValue(
    convertFromPln(amountPln, locale, currencyOverride),
    locale,
    currencyOverride,
  );
}
