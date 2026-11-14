import commonEn from "./en/common.json";
import cookiesEn from "./en/cookies.json";
import councilEn from "./en/council.json";
import intelligenceEn from "./en/intelligence.json";
import legalEn from "./en/legal.json";
import commonPl from "./pl/common.json";
import cookiesPl from "./pl/cookies.json";
import councilPl from "./pl/council.json";
import intelligencePl from "./pl/intelligence.json";
import legalPl from "./pl/legal.json";

export const SUPPORTED_LOCALES = ["en", "pl"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type CommonDictionary = typeof commonEn;
export type IntelligenceDictionary = typeof intelligenceEn;
export type CookiesDictionary = typeof cookiesEn;
export type LegalDictionary = typeof legalEn;
export type CouncilDictionary = typeof councilEn;

export type AppDictionary = CommonDictionary &
  IntelligenceDictionary &
  CookiesDictionary &
  LegalDictionary &
  CouncilDictionary;

export const translations: Record<Locale, AppDictionary> = {
  en: {
    ...commonEn,
    ...intelligenceEn,
    ...cookiesEn,
    ...legalEn,
    ...councilEn,
  },
  pl: {
    ...commonPl,
    ...intelligencePl,
    ...cookiesPl,
    ...legalPl,
    ...councilPl,
  },
};

export function resolveLocale(value?: unknown): Locale {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if ((SUPPORTED_LOCALES as readonly string[]).includes(normalized)) {
      return normalized as Locale;
    }
  }
  return "en";
}

export function formatTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}
