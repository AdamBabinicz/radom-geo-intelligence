import type { IndustryId } from "../../config/industries";
import {
  isSupportedDisplayCurrency,
  SUPPORTED_DISPLAY_CURRENCIES,
  type DisplayCurrency,
} from "../../lib/currency";
import { resolveLocale, SUPPORTED_LOCALES } from "../../locales";
import {
  analyzeCompetitors,
  calculateServiceFee,
  createCustomerQuote,
  createJiraMarketingEpics,
  exportStrategyToConfluence,
  generateLocalizedCampaign,
  type CouncilExecutionContext,
  type ServiceBenchmarkInput,
} from "../index";

function parseIndustryId(value: unknown): IndustryId | undefined {
  return value === "upholstery" || value === "hvac" || value === "plumbing"
    ? value
    : undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(String) : undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseOptionalCurrency(value: unknown): DisplayCurrency | undefined {
  return isSupportedDisplayCurrency(value)
    ? (value.trim().toUpperCase() as DisplayCurrency)
    : undefined;
}

function parseBenchmarks(value: unknown): ServiceBenchmarkInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: ServiceBenchmarkInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (
      typeof obj.serviceKey === "string" &&
      typeof obj.ourPricePln === "number" &&
      Number.isFinite(obj.ourPricePln) &&
      typeof obj.localPricePln === "number" &&
      Number.isFinite(obj.localPricePln)
    ) {
      parsed.push({
        serviceKey: obj.serviceKey,
        serviceLabel:
          typeof obj.serviceLabel === "string" ? obj.serviceLabel : undefined,
        ourPricePln: obj.ourPricePln,
        localPricePln: obj.localPricePln,
      });
    }
  }
  return parsed.length > 0 ? parsed : undefined;
}

function parseCouncilContext(
  value: unknown,
): CouncilExecutionContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const selectedOptionTitle =
    typeof obj.selectedOptionTitle === "string"
      ? obj.selectedOptionTitle.trim()
      : "";
  if (!selectedOptionTitle) return undefined;

  let policyMeasurement: CouncilExecutionContext["policyMeasurement"];
  if (obj.policyMeasurement && typeof obj.policyMeasurement === "object") {
    const pm = obj.policyMeasurement as Record<string, unknown>;
    if (
      typeof pm.passed === "boolean" &&
      typeof pm.checksPassed === "number" &&
      typeof pm.checksTotal === "number" &&
      typeof pm.enforcedCorrections === "number"
    ) {
      policyMeasurement = {
        passed: pm.passed,
        checksPassed: pm.checksPassed,
        checksTotal: pm.checksTotal,
        enforcedCorrections: pm.enforcedCorrections,
      };
    }
  }

  return {
    selectedOptionTitle,
    selectedOptionSummary:
      typeof obj.selectedOptionSummary === "string"
        ? obj.selectedOptionSummary.trim()
        : undefined,
    strategistModel:
      typeof obj.strategistModel === "string"
        ? obj.strategistModel.trim()
        : undefined,
    criticModel:
      typeof obj.criticModel === "string" ? obj.criticModel.trim() : undefined,
    riskScore: parseOptionalNumber(obj.riskScore),
    criticObjections: parseStringArray(obj.criticObjections),
    humanConstraint:
      typeof obj.humanConstraint === "string"
        ? obj.humanConstraint.trim()
        : undefined,
    actionItems: parseStringArray(obj.actionItems),
    policyMeasurement,
  };
}

const councilContextSchema = {
  type: "object",
  properties: {
    selectedOptionTitle: { type: "string" },
    selectedOptionSummary: { type: "string" },
    strategistModel: { type: "string" },
    criticModel: { type: "string" },
    riskScore: { type: "number" },
    criticObjections: { type: "array", items: { type: "string" } },
    humanConstraint: { type: "string" },
    actionItems: { type: "array", items: { type: "string" } },
    policyMeasurement: {
      type: "object",
      properties: {
        passed: { type: "boolean" },
        checksPassed: { type: "number" },
        checksTotal: { type: "number" },
        enforcedCorrections: { type: "number" },
      },
    },
  },
} as const;

export const mcpTools = [
  {
    name: "analyzeCompetitors",
    description:
      "Analyze competitor benchmarks, town coverage, and review pain points within a radius (10-100 km).",
    inputSchema: {
      type: "object",
      properties: {
        center: { type: "string" },
        radiusKm: { type: "number", minimum: 10, maximum: 100 },
        industryId: {
          type: "string",
          enum: ["upholstery", "hvac", "plumbing"],
        },
        townsInRadius: { type: "array", items: { type: "string" } },
        competitorsTracked: { type: "number", minimum: 0 },
        locale: { type: "string", enum: [...SUPPORTED_LOCALES] },
        currency: {
          type: "string",
          enum: [...SUPPORTED_DISPLAY_CURRENCIES],
        },
      },
      required: ["center", "radiusKm"],
    },
  },
  {
    name: "calculateServiceFee",
    description:
      "Estimate travel fee and order total for any target town, optional distanceKm, and display currency (PLN, USD, EUR, GBP).",
    inputSchema: {
      type: "object",
      properties: {
        town: { type: "string" },
        orderValue: { type: "number", minimum: 0 },
        distanceKm: { type: "number", minimum: 0 },
        locale: { type: "string", enum: [...SUPPORTED_LOCALES] },
        currency: {
          type: "string",
          enum: [...SUPPORTED_DISPLAY_CURRENCIES],
        },
      },
      required: ["town", "orderValue"],
    },
  },
  {
    name: "generateLocalizedCampaign",
    description:
      "Generate a localized marketing brief targeting towns inside the service radius.",
    inputSchema: {
      type: "object",
      properties: {
        season: { type: "string" },
        targetTowns: { type: "array", items: { type: "string" } },
        industryId: {
          type: "string",
          enum: ["upholstery", "hvac", "plumbing"],
        },
        locale: { type: "string", enum: [...SUPPORTED_LOCALES] },
      },
      required: ["season", "targetTowns"],
    },
  },
  {
    name: "exportStrategyToConfluence",
    description:
      "Publish (or draft if unconfigured) a structured Confluence strategy page from live radius metrics and optional AI Council debate context.",
    inputSchema: {
      type: "object",
      properties: {
        center: { type: "string" },
        radiusKm: { type: "number", minimum: 10, maximum: 100 },
        season: { type: "string" },
        industryId: {
          type: "string",
          enum: ["upholstery", "hvac", "plumbing"],
        },
        detectedIndustryLabel: { type: "string" },
        topPainPoint: { type: "string" },
        townsInRadius: { type: "array", items: { type: "string" } },
        competitorsTracked: { type: "number", minimum: 0 },
        benchmarks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              serviceKey: { type: "string" },
              serviceLabel: { type: "string" },
              ourPricePln: { type: "number" },
              localPricePln: { type: "number" },
            },
          },
        },
        councilContext: councilContextSchema,
        locale: { type: "string", enum: [...SUPPORTED_LOCALES] },
        currency: {
          type: "string",
          enum: [...SUPPORTED_DISPLAY_CURRENCIES],
        },
      },
      required: ["center", "radiusKm", "season"],
    },
  },
  {
    name: "createJiraMarketingEpics",
    description:
      "Create a Jira marketing Epic with localized town tasks and optional AI Council approved action items.",
    inputSchema: {
      type: "object",
      properties: {
        center: { type: "string" },
        radiusKm: { type: "number", minimum: 10, maximum: 100 },
        industryId: {
          type: "string",
          enum: ["upholstery", "hvac", "plumbing"],
        },
        townsInRadius: { type: "array", items: { type: "string" } },
        competitorsTracked: { type: "number", minimum: 0 },
        councilContext: councilContextSchema,
        locale: { type: "string", enum: [...SUPPORTED_LOCALES] },
        currency: {
          type: "string",
          enum: [...SUPPORTED_DISPLAY_CURRENCIES],
        },
      },
      required: ["center", "radiusKm"],
    },
  },
  {
    name: "createCustomerQuote",
    description:
      "Create a Jira customer quote ticket with unit quantity, travel fee, and zone estimate.",
    inputSchema: {
      type: "object",
      properties: {
        center: { type: "string" },
        town: { type: "string" },
        serviceKey: { type: "string" },
        serviceLabel: { type: "string" },
        quantity: { type: "number", minimum: 1 },
        unitLabel: { type: "string" },
        unitPricePln: { type: "number", minimum: 0 },
        travelFeePln: { type: "number", minimum: 0 },
        totalPln: { type: "number", minimum: 0 },
        inZone: { type: "boolean" },
        locale: { type: "string", enum: [...SUPPORTED_LOCALES] },
        currency: {
          type: "string",
          enum: [...SUPPORTED_DISPLAY_CURRENCIES],
        },
      },
      required: [
        "center",
        "town",
        "serviceKey",
        "unitPricePln",
        "travelFeePln",
        "totalPln",
      ],
    },
  },
] as const;

export async function callMcpTool(name: string, args: Record<string, unknown>) {
  if (name === "analyzeCompetitors") {
    return analyzeCompetitors({
      center: String(args.center ?? "Radom"),
      radiusKm: Number(args.radiusKm ?? 30),
      industryId: parseIndustryId(args.industryId),
      townsInRadius: parseStringArray(args.townsInRadius),
      competitorsTracked: parseOptionalNumber(args.competitorsTracked),
      locale: resolveLocale(args.locale),
      currency: parseOptionalCurrency(args.currency),
    });
  }
  if (name === "calculateServiceFee") {
    return calculateServiceFee({
      town: String(args.town ?? "Radom"),
      orderValue: Number(args.orderValue ?? 249),
      distanceKm: parseOptionalNumber(args.distanceKm),
      locale:
        args.locale !== undefined ? resolveLocale(args.locale) : undefined,
      currency: parseOptionalCurrency(args.currency),
    });
  }
  if (name === "generateLocalizedCampaign") {
    return generateLocalizedCampaign({
      season: String(args.season ?? "Q4"),
      targetTowns: Array.isArray(args.targetTowns)
        ? args.targetTowns.map(String)
        : ["Radom"],
      industryId: parseIndustryId(args.industryId),
      locale: resolveLocale(args.locale),
    });
  }
  if (name === "exportStrategyToConfluence") {
    return exportStrategyToConfluence({
      center: String(args.center ?? "Radom"),
      radiusKm: Number(args.radiusKm ?? 30),
      season: String(args.season ?? "Q4"),
      industryId: parseIndustryId(args.industryId),
      detectedIndustryLabel: parseOptionalString(args.detectedIndustryLabel),
      topPainPoint: parseOptionalString(args.topPainPoint),
      townsInRadius: parseStringArray(args.townsInRadius),
      competitorsTracked: parseOptionalNumber(args.competitorsTracked),
      benchmarks: parseBenchmarks(args.benchmarks),
      councilContext: parseCouncilContext(args.councilContext),
      locale: resolveLocale(args.locale),
      currency: parseOptionalCurrency(args.currency),
    });
  }
  if (name === "createJiraMarketingEpics") {
    return createJiraMarketingEpics({
      center: String(args.center ?? "Radom"),
      radiusKm: Number(args.radiusKm ?? 30),
      industryId: parseIndustryId(args.industryId),
      townsInRadius: parseStringArray(args.townsInRadius),
      competitorsTracked: parseOptionalNumber(args.competitorsTracked),
      councilContext: parseCouncilContext(args.councilContext),
      locale: resolveLocale(args.locale),
      currency: parseOptionalCurrency(args.currency),
    });
  }
  if (name === "createCustomerQuote") {
    return createCustomerQuote({
      center: String(args.center ?? "Radom"),
      town: String(args.town ?? "Radom"),
      serviceKey: String(args.serviceKey ?? "cornerSofa"),
      serviceLabel:
        typeof args.serviceLabel === "string" ? args.serviceLabel : undefined,
      quantity: parseOptionalNumber(args.quantity),
      unitLabel:
        typeof args.unitLabel === "string" ? args.unitLabel : undefined,
      unitPricePln: Number(args.unitPricePln ?? 0),
      travelFeePln: Number(args.travelFeePln ?? 0),
      totalPln: Number(args.totalPln ?? 0),
      inZone: typeof args.inZone === "boolean" ? args.inZone : true,
      locale: resolveLocale(args.locale),
      currency: parseOptionalCurrency(args.currency),
    });
  }
  throw new Error(`Unknown MCP tool: ${name}`);
}

export async function handleMcpJsonRpc(body: {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}) {
  const id = body.id ?? null;

  if (body.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "northstar-ops-mcp", version: "1.1.0" },
        capabilities: { tools: {} },
      },
    };
  }

  if (body.method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: mcpTools } };
  }

  if (body.method === "tools/call") {
    const name = String(body.params?.name ?? "");
    const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
    const data = await callMcpTool(name, args);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(data) }],
        structuredContent: data,
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `Unsupported MCP method: ${String(body.method)}`,
    },
  };
}
