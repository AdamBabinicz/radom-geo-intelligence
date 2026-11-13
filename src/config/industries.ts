export type IndustryId = "upholstery" | "hvac" | "plumbing";

export interface IndustryServiceItem {
  serviceKey:
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
  localPricePln: number;
  ourPricePln: number;
  isPerUnit?: boolean;
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
      },
      {
        serviceKey: "carpetFlooring",
        localPricePln: 11,
        ourPricePln: 8,
        isPerUnit: true,
      },
      {
        serviceKey: "upholsteryChair",
        localPricePln: 20,
        ourPricePln: 15,
      },
      {
        serviceKey: "cornerSofa",
        localPricePln: 280,
        ourPricePln: 249,
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
      { serviceKey: "acService", localPricePln: 360, ourPricePln: 319 },
      { serviceKey: "heatPumpCheck", localPricePln: 490, ourPricePln: 429 },
      {
        serviceKey: "ductCleaning",
        localPricePln: 45,
        ourPricePln: 39,
        isPerUnit: true,
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
      { serviceKey: "leakRepair", localPricePln: 320, ourPricePln: 279 },
      { serviceKey: "boilerService", localPricePln: 420, ourPricePln: 369 },
      { serviceKey: "drainUnclog", localPricePln: 260, ourPricePln: 229 },
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
