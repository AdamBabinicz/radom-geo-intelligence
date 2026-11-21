import type { ServiceUnitType } from "@/src/config/industries";
import type {
  DetectedIndustryMatch,
  ExtractedPrice,
  FallbackKeywordRule,
  SupportedCurrency,
} from "./types";

export const CANONICAL_SERVICE_KEYS = new Set<string>([
  "carpetArea",
  "carpetFlooring",
  "upholsteryChair",
  "cornerSofa",
  "twoSeatCouch",
  "acService",
  "heatPumpCheck",
  "ductCleaning",
  "leakRepair",
  "boilerService",
  "drainUnclog",
]);

const UPHOLSTERY_DETECTION_KEYS = new Set<string>([
  "carpetArea",
  "carpetFlooring",
  "upholsteryChair",
  "cornerSofa",
  "twoSeatCouch",
  "live:armchair-cleaning",
  "live:fotel",
  "live:krzeslo",
  "live:mattress-cleaning",
  "live:paver-cleaning",
]);

const HVAC_DETECTION_KEYS = new Set<string>([
  "acService",
  "heatPumpCheck",
  "ductCleaning",
]);

const PLUMBING_DETECTION_KEYS = new Set<string>([
  "leakRepair",
  "boilerService",
  "drainUnclog",
]);

export const FALLBACK_SERVICE_RULES: FallbackKeywordRule[] = [
  {
    serviceKey: "carpetArea",
    labelPl: "Pranie dywanów (za m²)",
    labelEn: "Carpet washing (per m²)",
    unitType: "m2",
    patterns: [
      /prani[ea]\s+dywan[óo]w/gi,
      /czyszczenie\s+dywan/gi,
      /carpet\s+washing/gi,
      /\bcarpet\b/gi,
    ],
  },
  {
    serviceKey: "carpetFlooring",
    labelPl: "Pranie wykładzin (za m²)",
    labelEn: "Fitted carpet cleaning (per m²)",
    unitType: "m2",
    patterns: [
      /prani[ea]\s+wyk[łl]adzin/gi,
      /czyszczenie\s+wyk[łl]adzin/gi,
      /wyk[łl]adzin/gi,
      /fitted\s+carpet/gi,
      /\bfloor\b/gi,
    ],
  },
  {
    serviceKey: "upholsteryChair",
    labelPl: "Tapicerka — krzesło (za szt.)",
    labelEn: "Upholstery — chair (per pc)",
    unitType: "piece",
    patterns: [/krzes[łl][oa]/gi, /upholstery\s+chair/gi, /\bchair\b/gi],
  },
  {
    serviceKey: "live:pouf-cleaning",
    labelPl: "Pranie pufy (za szt.)",
    labelEn: "Pouf / ottoman cleaning (per pc)",
    unitType: "piece",
    patterns: [/puf[ayę]?/gi, /\bpouf\b/gi, /ottoman/gi],
  },
  {
    serviceKey: "live:armchair-cleaning",
    labelPl: "Pranie fotela",
    labelEn: "Armchair cleaning",
    unitType: "fixed",
    patterns: [/fotel[aui]?/gi, /\barmchair\b/gi],
  },
  {
    serviceKey: "twoSeatCouch",
    labelPl: "Pranie kanapy / wersalki",
    labelEn: "Sofa / couch cleaning",
    unitType: "fixed",
    patterns: [
      /kanap[ayę]/gi,
      /wersalk[aię]/gi,
      /tapczan/gi,
      /2-seater/gi,
      /two-seat/gi,
      /\bsofa[23]?\b/gi,
      /\bcouch\b/gi,
    ],
  },
  {
    serviceKey: "cornerSofa",
    labelPl: "Czyszczenie narożnika / sofy",
    labelEn: "Corner sofa cleaning",
    unitType: "fixed",
    patterns: [/naro[żz]nik/gi, /corner\s+sofa/gi, /\bcorner\b/gi],
  },
  {
    serviceKey: "live:mattress-cleaning",
    labelPl: "Pranie materaca",
    labelEn: "Mattress cleaning",
    unitType: "fixed",
    patterns: [/materac/gi, /\bmattress[12]?\b/gi],
  },
  {
    serviceKey: "live:car-upholstery",
    labelPl: "Pranie tapicerki samochodowej",
    labelEn: "Car interior upholstery cleaning",
    unitType: "fixed",
    patterns: [/tapicerk[aię]\s+samochodow/gi, /car\s+upholstery/gi],
  },
  {
    serviceKey: "live:impregnation",
    labelPl: "Impregnacja tapicerki",
    labelEn: "Fabric protection / impregnation",
    unitType: "fixed",
    patterns: [/impregnacj/gi, /protector|scotchgard/gi],
  },
  {
    serviceKey: "live:ozonation",
    labelPl: "Ozonowanie pomieszczeń / mebli",
    labelEn: "Ozone odor neutralization",
    unitType: "fixed",
    patterns: [/ozonowani/gi, /ozone/gi],
  },
  {
    serviceKey: "live:paver-cleaning",
    labelPl: "Mycie kostki brukowej (za m²)",
    labelEn: "Paver pressure washing (per m²)",
    unitType: "m2",
    patterns: [/kostk[aię]\s+brukow/gi, /\bpaver\b/gi],
  },
  {
    serviceKey: "live:tile-cleaning",
    labelPl: "Mycie płytek / tarasu (za m²)",
    labelEn: "Tile & patio washing (per m²)",
    unitType: "m2",
    patterns: [/p[łl]yt(?:ki|ek|y)|taras/gi, /tile\s+clean/gi, /\btile\b/gi],
  },
  {
    serviceKey: "live:drying-service",
    labelPl: "Dosuszanie / wynajem wentylatora (za szt.)",
    labelEn: "Air mover drying service (per pc)",
    unitType: "piece",
    patterns: [/dosusz/gi, /\bdrying\b/gi],
  },
  {
    serviceKey: "acService",
    labelPl: "Przegląd klimatyzacji (split)",
    labelEn: "AC unit inspection (split)",
    unitType: "fixed",
    patterns: [/przegl[ąa]d\s+klimatyzacj/gi, /ac\s+unit\s+inspection/gi],
  },
  {
    serviceKey: "heatPumpCheck",
    labelPl: "Serwis pompy ciepła",
    labelEn: "Heat pump service",
    unitType: "fixed",
    patterns: [/pomp[ayę]\s+ciep[łl]a/gi, /heat\s+pump\s+service/gi],
  },
  {
    serviceKey: "ductCleaning",
    labelPl: "Czyszczenie wentylacji (za m²)",
    labelEn: "Air duct cleaning (per m²)",
    unitType: "m2",
    patterns: [/czyszczenie\s+wentylacj/gi, /duct\s+cleaning/gi],
  },
  {
    serviceKey: "leakRepair",
    labelPl: "Usuwanie wycieku (pilne)",
    labelEn: "Urgent leak repair",
    unitType: "fixed",
    patterns: [/usuwanie\s+wyciek/gi, /leak\s+repair/gi],
  },
  {
    serviceKey: "boilerService",
    labelPl: "Przegląd kotła / pieca",
    labelEn: "Boiler / furnace inspection",
    unitType: "fixed",
    patterns: [/przegl[ąa]d\s+kot[łl]a/gi, /boiler\s+inspection/gi],
  },
  {
    serviceKey: "drainUnclog",
    labelPl: "Udrażnianie kanalizacji",
    labelEn: "Drain & sewer unclogging",
    unitType: "fixed",
    patterns: [/udra[żz]nianie/gi, /drain\s+unclog/gi],
  },
];

const CHAIR_LABEL_RE =
  /(?:^|[^a-ząćęłńóśźż])(krzes[łl][a-ząćęłńóśźż]*|chair[a-z]*|taboret[a-ząćęłńóśźż]*|stool[a-z]*)(?=$|[^a-ząćęłńóśźż])/i;
const ARMCHAIR_OR_SMALL_SEAT_RE =
  /(?:^|[^a-ząćęłńóśźż])(fotel[a-ząćęłńóśźż]*|armchair[a-z]*|recliner[a-z]*|uszak[a-ząćęłńóśźż]*|puf[a-ząćęłńóśźż]*|pouf[a-z]*|ottoman[a-z]*|poduch[a-ząćęłńóśźż]*|cushion[a-z]*|kanap[a-ząćęłńóśźż]*|sof[a-ząćęłńóśźż]*|naro[żz]nik[a-ząćęłńóśźż]*|corner|materac[a-ząćęłńóśźż]*|mattress[a-z]*)(?=$|[^a-ząćęłńóśźż])/i;
const CARPET_LABEL_RE =
  /(?:^|[^a-ząćęłńóśźż])(dywan[a-ząćęłńóśźż]*|carpet[a-z]*|rug[a-z]*)(?=$|[^a-ząćęłńóśźż])/i;
const FLOORING_LABEL_RE =
  /(?:^|[^a-ząćęłńóśźż])(wyk[łl]adzin[a-ząćęłńóśźż]*|fitted\s+carpet[a-z]*|flooring)(?=$|[^a-ząćęłńóśźż])/i;
const CORNER_SOFA_LABEL_RE =
  /(?:^|[^a-ząćęłńóśźż])(naro[żz]nik[a-ząćęłńóśźż]*|corner\s*sofa[a-z]*|l[\s-]?shape[a-z]*)(?=$|[^a-ząćęłńóśźż])/i;
const COUCH_LABEL_RE =
  /(?:^|[^a-ząćęłńóśźż])(sof[a-ząćęłńóśźż]*|kanap[a-ząćęłńóśźż]*|couch[a-z]*|loveseat[a-z]*)(?=$|[^a-ząćęłńóśźż])/i;

export function isCanonicalKeyCompatibleWithLabel(
  canonicalKey: string,
  labelPl: string,
  labelEn: string,
): boolean {
  const text = `${labelPl} ${labelEn}`.toLowerCase();
  switch (canonicalKey) {
    case "upholsteryChair":
      return CHAIR_LABEL_RE.test(text) && !ARMCHAIR_OR_SMALL_SEAT_RE.test(text);
    case "carpetArea":
      return (
        CARPET_LABEL_RE.test(text) &&
        !FLOORING_LABEL_RE.test(text) &&
        !/(?:oriental|jedwab|silk|kostk|paver|p[łl]yt|tile|fotel|krzes[łl]|sof|naro[żz]nik|materac)/i.test(
          text,
        )
      );
    case "carpetFlooring":
      return (
        FLOORING_LABEL_RE.test(text) &&
        !/(?:oriental|kostk|paver|p[łl]yt|tile|fotel|krzes[łl]|sof|naro[żz]nik)/i.test(
          text,
        )
      );
    case "cornerSofa":
      return CORNER_SOFA_LABEL_RE.test(text);
    case "twoSeatCouch":
      return (
        COUCH_LABEL_RE.test(text) &&
        !CORNER_SOFA_LABEL_RE.test(text) &&
        !/(?:3[\s-]*(?:os|seat)|trzyosobow|wersalk|tapczan|fotel|armchair|krzes[łl]|chair)/i.test(
          text,
        )
      );
    case "acService":
      return (
        /(?:klimatyzac|air[\s-]*cond|\bac\b|split)/i.test(text) &&
        !/(?:pomp|heat\s*pump|wentylac|duct)/i.test(text)
      );
    case "heatPumpCheck":
      return /(?:pomp[a-ząćęłńóśźż]*\s+ciep[łl]|heat\s*pump)/i.test(text);
    case "ductCleaning":
      return /(?:wentylac|rekuperac|duct)/i.test(text);
    case "leakRepair":
      return /(?:wyciek|leak|awari|rur|pipe)/i.test(text);
    case "boilerService":
      return /(?:kot[łl]|kocio[łl]|piec|boiler|furnace)/i.test(text);
    case "drainUnclog":
      return /(?:udra[żz]nian|kanalizac|odp[łl]yw|drain|sewer|unclog)/i.test(
        text,
      );
    default:
      return true;
  }
}

export function resolveCanonicalPromotionKey(
  labelPl: string,
  labelEn: string,
): string | null {
  const text = `${labelPl} ${labelEn}`.toLowerCase();
  if (CHAIR_LABEL_RE.test(text) && !ARMCHAIR_OR_SMALL_SEAT_RE.test(text)) {
    return "upholsteryChair";
  }
  if (CORNER_SOFA_LABEL_RE.test(text)) {
    return "cornerSofa";
  }
  if (isCanonicalKeyCompatibleWithLabel("twoSeatCouch", labelPl, labelEn)) {
    return "twoSeatCouch";
  }
  if (isCanonicalKeyCompatibleWithLabel("carpetArea", labelPl, labelEn)) {
    return "carpetArea";
  }
  if (
    isCanonicalKeyCompatibleWithLabel("carpetFlooring", labelPl, labelEn) &&
    !/(?:do|up\s*to|<=)\s*50\b/i.test(text)
  ) {
    return "carpetFlooring";
  }
  return null;
}

export function normalizeCurrency(raw: unknown): SupportedCurrency {
  const val = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (val === "USD" || val === "$") return "USD";
  if (val === "EUR" || val === "€") return "EUR";
  return "PLN";
}

export function toPln(amount: number, currency: SupportedCurrency): number {
  if (currency === "USD") return Math.round(amount * 4);
  if (currency === "EUR") return Math.round(amount * 4.3);
  return Math.round(amount);
}

export function normalizeUnitType(raw: unknown): ServiceUnitType {
  const val = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (val === "m2" || val === "sqm" || val === "m²") return "m2";
  if (
    val === "piece" ||
    val === "pc" ||
    val === "pcs" ||
    val === "unit" ||
    val === "szt" ||
    val === "szt."
  ) {
    return "piece";
  }
  return "fixed";
}

export function inferUnitTypeFromText(text: string): ServiceUnitType {
  if (/m2|m²|mkw|sq\s*m/i.test(text)) return "m2";
  if (
    /(?:szt|pc|pcs|os\.|person|hour|godz|dzie[ńn]|day|imprez|event)/i.test(text)
  ) {
    return "piece";
  }
  return "fixed";
}

export function toAsciiSlug(input: string): string {
  const plMap: Record<string, string> = {
    ą: "a",
    ć: "c",
    ę: "e",
    ł: "l",
    ń: "n",
    ó: "o",
    ś: "s",
    ź: "z",
    ż: "z",
  };
  return input
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => plMap[ch] ?? ch)
    .replace(/^live:/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function normalizeExtractedServiceKey(
  rawKey: unknown,
  fallbackLabel: string,
): string {
  const raw = typeof rawKey === "string" ? rawKey.trim() : "";
  if (CANONICAL_SERVICE_KEYS.has(raw)) {
    return raw;
  }
  const slug = toAsciiSlug(raw || fallbackLabel);
  return slug ? `live:${slug}` : "";
}

export function buildUniqueLiveKey(
  labelPl: string,
  labelEn: string,
  takenKeys: Set<string>,
): string {
  const baseSlug = toAsciiSlug(labelPl || labelEn);
  if (!baseSlug) return "";
  let candidate = `live:${baseSlug}`;
  let suffix = 2;
  while (takenKeys.has(candidate)) {
    candidate = `live:${baseSlug.slice(0, 44)}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function inferPresetFromPrices(
  prices: ExtractedPrice[],
): DetectedIndustryMatch {
  let upholsteryHits = 0;
  let hvacHits = 0;
  let plumbingHits = 0;
  for (const item of prices) {
    if (UPHOLSTERY_DETECTION_KEYS.has(item.serviceKey)) upholsteryHits++;
    if (HVAC_DETECTION_KEYS.has(item.serviceKey)) hvacHits++;
    if (PLUMBING_DETECTION_KEYS.has(item.serviceKey)) plumbingHits++;
  }
  if (upholsteryHits >= 2) return "upholstery";
  if (hvacHits >= 2) return "hvac";
  if (plumbingHits >= 2) return "plumbing";
  return "custom";
}

export function matchPriceInWindow(windowText: string): {
  pricePln: number;
  detectedAmount: number;
  detectedCurrency: SupportedCurrency;
} | null {
  if (/^\s*\+/.test(windowText)) return null;
  const priceSuffixRe =
    /(?:od|from)?\s*(\d{1,5}(?:[.,]\d{1,2})?)(?:\s*[-–]\s*\d{1,5}(?:[.,]\d{1,2})?)?\s*(z[łl]|pln|usd|eur|\$|€)/i;
  const pricePrefixRe = /(\$|€|usd|eur)\s*(\d{1,5}(?:[.,]\d{1,2})?)/i;

  const suffixMatch = windowText.match(priceSuffixRe);
  if (suffixMatch) {
    const amount = Number(suffixMatch[1].replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) {
      const currency = normalizeCurrency(suffixMatch[2]);
      return {
        pricePln: toPln(amount, currency),
        detectedAmount: amount,
        detectedCurrency: currency,
      };
    }
  }

  const prefixMatch = windowText.match(pricePrefixRe);
  if (prefixMatch) {
    const amount = Number(prefixMatch[2].replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) {
      const currency = normalizeCurrency(prefixMatch[1]);
      return {
        pricePln: toPln(amount, currency),
        detectedAmount: amount,
        detectedCurrency: currency,
      };
    }
  }
  return null;
}
