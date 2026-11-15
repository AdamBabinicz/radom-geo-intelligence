export type IndustryId = "upholstery" | "hvac" | "plumbing";

export type CanonicalServiceKey =
  | "cornerSofa"
  | "twoSeatCouch"
  | "carpetArea"
  | "carpetFlooring"
  | "upholsteryChair"
  | "acService"
  | "heatPumpCheck"
  | "ductCleaning"
  | "leakRepair"
  | "boilerService"
  | "drainUnclog";

export type ServiceKey = CanonicalServiceKey | (string & {});

export type ServiceUnitType = "m2" | "piece" | "fixed";

export interface ServiceLocaleLabels {
  pl?: string;
  en?: string;
}

export interface IndustryServiceItem {
  serviceKey: ServiceKey;
  localPricePln: number;
  ourPricePln: number;
  isPerUnit?: boolean;
  unitType?: ServiceUnitType;
  labels?: ServiceLocaleLabels;
  isLiveDiscovered?: boolean;
}

export interface IndustryPainPoint {
  topicKey:
    | "dryingTime"
    | "hiddenFees"
    | "punctuality"
    | "peakWaitTime"
    | "refrigerantFees"
    | "noProtocol"
    | "emergencyDelay"
    | "unclearQuote"
    | "cleanupQuality";
  percent: number;
}

export interface IndustryTemplate {
  id: IndustryId;
  labelKey: "industryUpholstery" | "industryHvac" | "industryPlumbing";
  services: IndustryServiceItem[];
  painPoints: IndustryPainPoint[];
}

export function resolveUnitType(
  item: Pick<IndustryServiceItem, "serviceKey" | "unitType" | "isPerUnit">,
): ServiceUnitType {
  if (
    item.unitType === "m2" ||
    item.unitType === "piece" ||
    item.unitType === "fixed"
  ) {
    return item.unitType;
  }
  if (item.serviceKey === "upholsteryChair") {
    return "piece";
  }
  if (item.isPerUnit) {
    return "m2";
  }
  return "fixed";
}

function humanizeServiceKey(key: string): string {
  const cleaned = key
    .replace(/^live:/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!cleaned) return key;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function resolveServiceLabel(
  item: { serviceKey: string; labels?: ServiceLocaleLabels },
  dictionary: Record<string, unknown>,
  locale: "pl" | "en",
): string {
  const localized = item.labels?.[locale]?.trim();
  if (localized) return localized;

  const dictValue = dictionary[item.serviceKey];
  if (typeof dictValue === "string" && dictValue.trim()) {
    return dictValue.trim();
  }

  const fallbackLabel =
    locale === "pl" ? item.labels?.en?.trim() : item.labels?.pl?.trim();
  if (fallbackLabel) return fallbackLabel;

  return humanizeServiceKey(item.serviceKey);
}

export const INDUSTRY_TEMPLATES: Record<IndustryId, IndustryTemplate> = {
  upholstery: {
    id: "upholstery",
    labelKey: "industryUpholstery",
    services: [
      {
        serviceKey: "carpetArea",
        localPricePln: 34,
        ourPricePln: 28,
        isPerUnit: true,
        unitType: "m2",
      },
      {
        serviceKey: "carpetFlooring",
        localPricePln: 20,
        ourPricePln: 15,
        isPerUnit: true,
        unitType: "m2",
      },
      {
        serviceKey: "upholsteryChair",
        localPricePln: 20,
        ourPricePln: 15,
        isPerUnit: true,
        unitType: "piece",
      },
      {
        serviceKey: "cornerSofa",
        localPricePln: 280,
        ourPricePln: 250,
        unitType: "fixed",
      },
    ],
    painPoints: [
      { topicKey: "dryingTime", percent: 38 },
      { topicKey: "hiddenFees", percent: 31 },
      { topicKey: "punctuality", percent: 19 },
    ],
  },
  hvac: {
    id: "hvac",
    labelKey: "industryHvac",
    services: [
      {
        serviceKey: "acService",
        localPricePln: 360,
        ourPricePln: 319,
        unitType: "fixed",
      },
      {
        serviceKey: "heatPumpCheck",
        localPricePln: 490,
        ourPricePln: 429,
        unitType: "fixed",
      },
      {
        serviceKey: "ductCleaning",
        localPricePln: 45,
        ourPricePln: 39,
        isPerUnit: true,
        unitType: "m2",
      },
    ],
    painPoints: [
      { topicKey: "peakWaitTime", percent: 42 },
      { topicKey: "refrigerantFees", percent: 29 },
      { topicKey: "noProtocol", percent: 18 },
    ],
  },
  plumbing: {
    id: "plumbing",
    labelKey: "industryPlumbing",
    services: [
      {
        serviceKey: "leakRepair",
        localPricePln: 320,
        ourPricePln: 279,
        unitType: "fixed",
      },
      {
        serviceKey: "boilerService",
        localPricePln: 420,
        ourPricePln: 369,
        unitType: "fixed",
      },
      {
        serviceKey: "drainUnclog",
        localPricePln: 260,
        ourPricePln: 229,
        unitType: "fixed",
      },
    ],
    painPoints: [
      { topicKey: "emergencyDelay", percent: 44 },
      { topicKey: "unclearQuote", percent: 35 },
      { topicKey: "cleanupQuality", percent: 16 },
    ],
  },
};

export const INDUSTRY_LIST: IndustryTemplate[] =
  Object.values(INDUSTRY_TEMPLATES);
