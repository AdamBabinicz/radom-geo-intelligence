import commonEn from "./en/common.json";
import cookiesEn from "./en/cookies.json";
import intelligenceEn from "./en/intelligence.json";
import legalEn from "./en/legal.json";
import commonPl from "./pl/common.json";
import cookiesPl from "./pl/cookies.json";
import intelligencePl from "./pl/intelligence.json";
import legalPl from "./pl/legal.json";

export type Locale = "en" | "pl";
export type CommonDictionary = typeof commonEn;
export type IntelligenceDictionary = typeof intelligenceEn;
export type CookiesDictionary = typeof cookiesEn;
export type LegalDictionary = typeof legalEn;
export type AppDictionary = CommonDictionary &
  IntelligenceDictionary &
  CookiesDictionary &
  LegalDictionary;

export const translations: Record<Locale, AppDictionary> = {
  en: { ...commonEn, ...intelligenceEn, ...cookiesEn, ...legalEn },
  pl: { ...commonPl, ...intelligencePl, ...cookiesPl, ...legalPl },
};
