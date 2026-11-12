import commonEn from './en/common.json'
import intelligenceEn from './en/intelligence.json'
import commonPl from './pl/common.json'
import intelligencePl from './pl/intelligence.json'

export type Locale = 'en' | 'pl'
export type CommonDictionary = typeof commonEn
export type IntelligenceDictionary = typeof intelligenceEn
export type AppDictionary = CommonDictionary & IntelligenceDictionary

export const translations: Record<Locale, AppDictionary> = {
  en: { ...commonEn, ...intelligenceEn },
  pl: { ...commonPl, ...intelligencePl },
}
