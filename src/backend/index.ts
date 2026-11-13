import { INDUSTRY_TEMPLATES, type IndustryId } from "../config/industries";
import {
  getMarketMetrics,
  getTownTravelFeePln,
  RADOM_UPHOLSTERY_MARKET,
} from "../config/markets";
import type {
  CampaignSpec,
  CompetitorAnalysisInput,
  CompetitorInsight,
  ConfluenceExportResult,
  JiraEpicResult,
  ServiceFeeInput,
  ServiceFeeQuote,
} from "../types/market";

const SUPPORTED_TOWNS = [
  RADOM_UPHOLSTERY_MARKET.centerName,
  ...RADOM_UPHOLSTERY_MARKET.towns
    .filter((t) => !t.isRegionalHub)
    .map((t) => t.name),
];

const SERVICE_NAMES: Record<string, { en: string; pl: string }> = {
  cornerSofa: { en: "Corner sofa cleaning", pl: "Czyszczenie narożnika" },
  twoSeatCouch: {
    en: "Two-seat couch cleaning",
    pl: "Czyszczenie kanapy 2-osobowej",
  },
  carpetArea: { en: "Carpet washing / m2", pl: "Pranie dywanów / m2" },
  carpetFlooring: {
    en: "Fitted carpet cleaning / m2",
    pl: "Pranie wykładzin / m2",
  },
  upholsteryChair: {
    en: "Upholstery — chair / pc",
    pl: "Tapicerka — krzesło / szt.",
  },
  acService: { en: "AC unit inspection", pl: "Przegląd klimatyzacji" },
  heatPumpCheck: { en: "Heat pump service", pl: "Serwis pompy ciepła" },
  ductCleaning: {
    en: "Air duct cleaning / m2",
    pl: "Czyszczenie wentylacji / m2",
  },
  leakRepair: { en: "Urgent leak repair", pl: "Usuwanie wycieku (pilne)" },
  boilerService: { en: "Boiler inspection", pl: "Przegląd kotła / pieca" },
  drainUnclog: { en: "Drain unclogging", pl: "Udrażnianie kanalizacji" },
};

const PAIN_NAMES: Record<string, { en: string; pl: string }> = {
  dryingTime: { en: "Long drying time", pl: "Długi czas schnięcia" },
  hiddenFees: { en: "Hidden fees", pl: "Ukryte opłaty" },
  punctuality: { en: "Punctuality", pl: "Punktualność" },
  peakWaitTime: {
    en: "Long peak-season wait",
    pl: "Długi czas oczekiwania w sezonie",
  },
  refrigerantFees: {
    en: "Hidden refrigerant fees",
    pl: "Ukryte koszty czynnika",
  },
  noProtocol: {
    en: "No tightness protocol",
    pl: "Brak protokołu szczelności",
  },
  emergencyDelay: {
    en: "Emergency dispatch delays",
    pl: "Opóźnienia w awariach",
  },
  unclearQuote: { en: "Unclear upfront quote", pl: "Niejasna wycena wstępna" },
  cleanupQuality: {
    en: "Poor post-job cleanup",
    pl: "Brak sprzątania po pracy",
  },
};

export interface ServiceBenchmarkInput {
  serviceKey: string;
  ourPricePln: number;
  localPricePln: number;
}

export interface ExtendedAnalysisInput extends CompetitorAnalysisInput {
  industryId?: IndustryId;
  townsInRadius?: string[];
  competitorsTracked?: number;
  locale?: "en" | "pl";
}

interface AtlassianConfig {
  baseUrl: string;
  authHeader: string;
  spaceKey: string;
  projectKey: string;
}

interface JiraIssueTypeInfo {
  id: string;
  name: string;
  subtask: boolean;
}

function getAtlassianConfig(): AtlassianConfig | null {
  const rawUrl = process.env.ATLASSIAN_BASE_URL?.trim();
  const email = process.env.ATLASSIAN_EMAIL?.trim();
  const token = process.env.ATLASSIAN_API_TOKEN?.trim();
  if (!rawUrl || !email || !token) return null;

  return {
    baseUrl: rawUrl.replace(/\/+$/, ""),
    authHeader: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
    spaceKey:
      process.env.ATLASSIAN_CONFLUENCE_SPACE_KEY?.trim() || "northstarg",
    projectKey: (
      process.env.ATLASSIAN_JIRA_PROJECT_KEY?.trim() || "KAN"
    ).toUpperCase(),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAdfDocument(paragraphs: string[]) {
  return {
    type: "doc",
    version: 1,
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

export async function analyzeCompetitors(
  input: ExtendedAnalysisInput,
): Promise<{
  center: string;
  radiusKm: number;
  serviceableTownsCount: number;
  competitorsTracked: number;
  townsInRadius: string[];
  insights: CompetitorInsight[];
  sourceStatus: "demo";
}> {
  if (
    !input.center.trim() ||
    !Number.isFinite(input.radiusKm) ||
    input.radiusKm < 10 ||
    input.radiusKm > 100
  ) {
    throw new Error("Invalid center or radiusKm (expected 10-100)");
  }

  const industry = INDUSTRY_TEMPLATES[input.industryId ?? "upholstery"];
  const lang = input.locale === "pl" ? "pl" : "en";
  const metrics = getMarketMetrics(RADOM_UPHOLSTERY_MARKET, input.radiusKm);

  const townsInRadius =
    input.townsInRadius && input.townsInRadius.length > 0
      ? input.townsInRadius
      : [
          input.center.trim(),
          ...metrics.localTowns
            .filter((t) => t.distKm <= input.radiusKm)
            .map((t) => t.name),
        ];

  const serviceableTownsCount = townsInRadius.length;
  const competitorsTracked =
    typeof input.competitorsTracked === "number"
      ? input.competitorsTracked
      : metrics.competitorsTracked;

  const painPoints = industry.painPoints.map((p) => ({
    topic: PAIN_NAMES[p.topicKey]?.[lang] ?? p.topicKey,
    mentions: p.percent,
  }));

  const insights: CompetitorInsight[] = industry.services.map((svc, idx) => ({
    service: SERVICE_NAMES[svc.serviceKey]?.[lang] ?? svc.serviceKey,
    averagePricePln: svc.localPricePln,
    ourPricePln: svc.ourPricePln,
    sourceStatus: "demo",
    reviewPainPoints: painPoints.slice(idx % 2, (idx % 2) + 2),
  }));

  return {
    center: input.center,
    radiusKm: input.radiusKm,
    serviceableTownsCount,
    competitorsTracked,
    townsInRadius,
    sourceStatus: "demo",
    insights,
  };
}

export function calculateServiceFee(input: ServiceFeeInput): ServiceFeeQuote {
  if (
    !SUPPORTED_TOWNS.includes(input.town) ||
    !Number.isFinite(input.orderValue) ||
    input.orderValue < 0
  ) {
    throw new Error("Invalid service fee input");
  }

  const travelFeePln = getTownTravelFeePln(RADOM_UPHOLSTERY_MARKET, input.town);
  return {
    town: input.town,
    orderValue: input.orderValue,
    travelFeePln,
    totalPln: input.orderValue + travelFeePln,
    sourceStatus: "demo",
  };
}

export function generateLocalizedCampaign(input: {
  season: string;
  targetTowns: string[];
  industryId?: IndustryId;
  locale?: "en" | "pl";
}): CampaignSpec {
  if (!input.season.trim() || !input.targetTowns.length) {
    throw new Error("Invalid campaign request");
  }

  const isPl = input.locale === "pl";
  const industryId = input.industryId ?? "upholstery";

  const copyByIndustry: Record<
    IndustryId,
    {
      headlineEn: string;
      headlinePl: string;
      audienceEn: string;
      audiencePl: string;
      offerEn: string;
      offerPl: string;
    }
  > = {
    upholstery: {
      headlineEn: `A fresher home this ${input.season} — upfront pricing`,
      headlinePl: `Czyste wnętrza na ${input.season} — przejrzysta wycena`,
      audienceEn:
        "Local households seeking transparent pricing and fast-drying care",
      audiencePl:
        "Gospodarstwa domowe w strefie szukające szybkiego schnięcia i jasnej ceny",
      offerEn:
        "Zero hidden fees + clear drying-time SLA and predictable zone travel rates",
      offerPl:
        "Brak ukrytych opłat + gwarantowany czas schnięcia i stały dojazd w strefie",
    },
    hvac: {
      headlineEn: `Peak-ready HVAC & Heat Pumps (${input.season}) — certified SLA`,
      headlinePl: `Sprawna klimatyzacja i pompa ciepła na ${input.season} — z protokołem`,
      audienceEn:
        "Homeowners & offices frustrated by peak wait times and surprise fees",
      audiencePl:
        "Domy i biura w strefie zmęczone kolejkami w sezonie i dopłatami za czynnik",
      offerEn:
        "48h booking slot + upfront refrigerant pricing and full tightness protocol",
      offerPl:
        "Termin do 48h + jawny cennik czynnika i pełny protokół szczelności",
    },
    plumbing: {
      headlineEn: `24/7 Rapid Plumbing Dispatch (${input.season}) — fixed arrival rate`,
      headlinePl: `Pogotowie hydrauliczne 24/7 na ${input.season} — znana cena z góry`,
      audienceEn:
        "Property owners needing fast emergency response with clean post-job handoff",
      audiencePl:
        "Właściciele mieszkań i domów oczekujący szybkiego dojazdu i czystego montażu",
      offerEn:
        "Guaranteed dispatch ETA + upfront quote before repair and clean workspace",
      offerPl:
        "Gwarantowany czas dojazdu + wycena przed pracą i porządek po naprawie",
    },
  };

  const copy = copyByIndustry[industryId];

  return {
    season: input.season,
    targetTowns: input.targetTowns,
    headline: isPl ? copy.headlinePl : copy.headlineEn,
    audience: isPl ? copy.audiencePl : copy.audienceEn,
    offer: isPl ? copy.offerPl : copy.offerEn,
    confluencePageTitle: isPl
      ? `Strategia kampanii (${input.season}) — ${input.targetTowns.slice(0, 4).join(", ")}`
      : `${input.season} Go-To-Market Strategy — ${input.targetTowns.slice(0, 4).join(", ")}`,
    sourceStatus: "draft",
  };
}

export async function exportStrategyToConfluence(input: {
  center: string;
  radiusKm: number;
  season: string;
  industryId?: IndustryId;
  townsInRadius?: string[];
  competitorsTracked?: number;
  benchmarks?: ServiceBenchmarkInput[];
  locale?: "en" | "pl";
}): Promise<ConfluenceExportResult> {
  const industryId = input.industryId ?? "upholstery";
  const template = INDUSTRY_TEMPLATES[industryId];
  const isPl = input.locale === "pl";
  const lang = isPl ? "pl" : "en";

  const activeBenchmarks =
    input.benchmarks && input.benchmarks.length > 0
      ? input.benchmarks
      : template.services.map((s) => ({
          serviceKey: s.serviceKey,
          ourPricePln: s.ourPricePln,
          localPricePln: s.localPricePln,
        }));

  const avgGapPct = Math.round(
    activeBenchmarks.reduce(
      (acc, s) =>
        acc +
        (s.localPricePln > 0
          ? ((s.ourPricePln - s.localPricePln) / s.localPricePln) * 100
          : 0),
      0,
    ) / Math.max(1, activeBenchmarks.length),
  );

  const analysis = await analyzeCompetitors({
    center: input.center,
    radiusKm: input.radiusKm,
    industryId,
    townsInRadius: input.townsInRadius,
    competitorsTracked: input.competitorsTracked,
    locale: input.locale,
  });
  const campaign = generateLocalizedCampaign({
    season: input.season,
    targetTowns: analysis.townsInRadius,
    industryId,
    locale: input.locale,
  });

  const topPain = PAIN_NAMES[template.painPoints[0].topicKey]?.[lang] ?? "";
  const gapText = `${avgGapPct > 0 ? "+" : ""}${avgGapPct}%`;
  const summary = isPl
    ? `Zasięg ${analysis.radiusKm} km (${analysis.serviceableTownsCount} miejscowości, ${analysis.competitorsTracked} konkurentów). Różnica cenowa ${gapText} i odpowiedź na problem: ${topPain}.`
    : `${analysis.radiusKm} km zone (${analysis.serviceableTownsCount} towns, ${analysis.competitorsTracked} competitors). Price delta ${gapText} addressing: ${topPain}.`;

  const atlassian = getAtlassianConfig();
  if (atlassian) {
    try {
      let spaceId: string | null = null;
      let resolvedSpaceKey = atlassian.spaceKey;

      const byKeyRes = await fetch(
        `${atlassian.baseUrl}/wiki/api/v2/spaces?keys=${encodeURIComponent(atlassian.spaceKey)}&limit=5`,
        {
          headers: {
            Authorization: atlassian.authHeader,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000),
        },
      );

      if (byKeyRes.ok) {
        const data = (await byKeyRes.json()) as {
          results?: Array<{ id: string; key: string }>;
        };
        if (data.results && data.results.length > 0) {
          spaceId = String(data.results[0].id);
          resolvedSpaceKey = data.results[0].key;
        }
      }

      if (!spaceId) {
        const listRes = await fetch(
          `${atlassian.baseUrl}/wiki/api/v2/spaces?limit=5`,
          {
            headers: {
              Authorization: atlassian.authHeader,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(8000),
          },
        );
        if (listRes.ok) {
          const listData = (await listRes.json()) as {
            results?: Array<{ id: string; key: string }>;
          };
          if (listData.results && listData.results.length > 0) {
            spaceId = String(listData.results[0].id);
            resolvedSpaceKey = listData.results[0].key;
          }
        }
      }

      if (spaceId) {
        const rowsHtml = activeBenchmarks
          .map((row) => {
            const label =
              SERVICE_NAMES[row.serviceKey]?.[lang] ?? row.serviceKey;
            const delta =
              row.localPricePln > 0
                ? Math.round(
                    ((row.ourPricePln - row.localPricePln) /
                      row.localPricePln) *
                      100,
                  )
                : 0;
            const deltaStr = `${delta > 0 ? "+" : ""}${delta}%`;
            return `<tr><td>${escapeHtml(label)}</td><td>${row.ourPricePln} PLN</td><td>${row.localPricePln} PLN</td><td>${escapeHtml(deltaStr)}</td></tr>`;
          })
          .join("");

        const storageHtml = `
          <h1>Northstar Ops — ${escapeHtml(campaign.headline)}</h1>
          <p><strong>${isPl ? "Centrum operacyjne" : "Service Hub"}:</strong> ${escapeHtml(analysis.center)} (${analysis.radiusKm} km)<br/>
          <strong>${isPl ? "Obsługiwane miejscowości" : "Target Towns"}:</strong> ${escapeHtml(analysis.townsInRadius.join(", "))}<br/>
          <strong>${isPl ? "Analizowani konkurenci" : "Tracked Competitors"}:</strong> ${analysis.competitorsTracked}</p>
          <h2>${isPl ? "Podsumowanie strategiczne" : "Executive Summary"}</h2>
          <p>${escapeHtml(summary)}</p>
          <p><strong>${isPl ? "Propozycja wartości" : "Offer"}:</strong> ${escapeHtml(campaign.offer)}</p>
          <h2>${isPl ? "Porównanie cennika z rynkiem lokalnym" : "Live Pricing vs Local Market"}</h2>
          <table>
            <thead>
              <tr>
                <th>${isPl ? "Usługa" : "Service"}</th>
                <th>${isPl ? "Nasza cena" : "Our Price"}</th>
                <th>${isPl ? "Średnia rynku" : "Market Avg"}</th>
                <th>${isPl ? "Różnica" : "Delta"}</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        `.trim();

        const publishPage = async (title: string) =>
          fetch(`${atlassian.baseUrl}/wiki/api/v2/pages`, {
            method: "POST",
            headers: {
              Authorization: atlassian.authHeader,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              spaceId,
              status: "current",
              title,
              body: { representation: "storage", value: storageHtml },
            }),
            signal: AbortSignal.timeout(8000),
          });

        let finalTitle = campaign.confluencePageTitle;
        let createRes = await publishPage(finalTitle);

        if (createRes.status === 400) {
          const suffix = new Date()
            .toISOString()
            .slice(11, 19)
            .replace(/:/g, "");
          finalTitle = `${campaign.confluencePageTitle} [${suffix}]`;
          createRes = await publishPage(finalTitle);
        }

        if (createRes.ok) {
          const created = (await createRes.json()) as {
            title?: string;
            _links?: { webui?: string };
          };
          const pageUrl = created._links?.webui
            ? `${atlassian.baseUrl}/wiki${created._links.webui}`
            : `${atlassian.baseUrl}/wiki/spaces/${resolvedSpaceKey}`;

          return {
            pageTitle: created.title ?? finalTitle,
            spaceKey: resolvedSpaceKey,
            summary,
            targetTowns: analysis.townsInRadius,
            radiusKm: analysis.radiusKm,
            status: "published",
            pageUrl,
          };
        }
      }
    } catch (error) {
      console.error("[Atlassian Confluence Export Error]:", error);
    }
  }

  return {
    pageTitle: campaign.confluencePageTitle,
    spaceKey: atlassian?.spaceKey ?? "northstarg",
    summary,
    targetTowns: analysis.townsInRadius,
    radiusKm: analysis.radiusKm,
    status: "draft",
  };
}

export async function createJiraMarketingEpics(input: {
  center: string;
  radiusKm: number;
  industryId?: IndustryId;
  townsInRadius?: string[];
  competitorsTracked?: number;
  locale?: "en" | "pl";
}): Promise<JiraEpicResult> {
  const analysis = await analyzeCompetitors({
    center: input.center,
    radiusKm: input.radiusKm,
    industryId: input.industryId,
    townsInRadius: input.townsInRadius,
    competitorsTracked: input.competitorsTracked,
    locale: input.locale,
  });
  const isPl = input.locale === "pl";
  const epicTitle = isPl
    ? `[${input.center} ${input.radiusKm} km] Pozyskanie klientów i kalkulator strefowy`
    : `[${input.center} ${input.radiusKm} km] Local Service Expansion & Zone Pricing`;

  const plannedSubtasks = analysis.townsInRadius.slice(0, 4).map((town) => ({
    town,
    summary: isPl
      ? `Kampania lokalna i cennik dojazdu: ${town}`
      : `Localized ads & travel-fee landing card: ${town}`,
  }));

  const atlassian = getAtlassianConfig();
  if (atlassian) {
    try {
      const projectRes = await fetch(
        `${atlassian.baseUrl}/rest/api/3/project/${encodeURIComponent(atlassian.projectKey)}`,
        {
          headers: {
            Authorization: atlassian.authHeader,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000),
        },
      );

      if (projectRes.ok) {
        const project = (await projectRes.json()) as {
          issueTypes?: JiraIssueTypeInfo[];
        };
        const allTypes = project.issueTypes ?? [];
        const standardTypes = allTypes.filter((t) => !t.subtask);
        const epicType = standardTypes.find((t) =>
          /^(epic|epik)$/i.test(t.name),
        );
        const taskType =
          standardTypes.find((t) =>
            /^(task|zadanie|story|historia)$/i.test(t.name),
          ) ?? standardTypes[0];
        const subtaskType = allTypes.find((t) => t.subtask);
        const parentType = epicType ?? taskType;

        if (parentType) {
          const createIssue = async (fields: Record<string, unknown>) =>
            fetch(`${atlassian.baseUrl}/rest/api/3/issue`, {
              method: "POST",
              headers: {
                Authorization: atlassian.authHeader,
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ fields }),
              signal: AbortSignal.timeout(8000),
            });

          const parentRes = await createIssue({
            project: { key: atlassian.projectKey },
            summary: epicTitle,
            issuetype: { id: parentType.id },
            description: buildAdfDocument([
              `Hub: ${analysis.center} (${analysis.radiusKm} km)`,
              `Target towns: ${analysis.townsInRadius.join(", ")}`,
              `Tracked competitors: ${analysis.competitorsTracked}`,
              "Created live from Northstar Ops Geo-Intelligence Dashboard.",
            ]),
          });

          if (parentRes.ok) {
            const parentCreated = (await parentRes.json()) as { key: string };
            const createdChildren: Array<{
              key: string;
              summary: string;
              url?: string;
            }> = [];

            const childType =
              epicType && taskType ? taskType : (subtaskType ?? taskType);

            if (childType) {
              for (const item of plannedSubtasks) {
                const useParentLink =
                  (epicType && childType.id === taskType?.id) ||
                  childType.subtask;

                const baseFields: Record<string, unknown> = {
                  project: { key: atlassian.projectKey },
                  summary: item.summary,
                  issuetype: { id: childType.id },
                  description: buildAdfDocument([
                    `Town: ${item.town} | Hub: ${analysis.center} (${analysis.radiusKm} km)`,
                    `Parent plan: ${parentCreated.key}`,
                  ]),
                };

                let childRes = await createIssue(
                  useParentLink
                    ? { ...baseFields, parent: { key: parentCreated.key } }
                    : baseFields,
                );

                if (!childRes.ok && useParentLink && taskType) {
                  childRes = await createIssue({
                    ...baseFields,
                    issuetype: { id: taskType.id },
                  });
                }

                if (childRes.ok) {
                  const childData = (await childRes.json()) as { key: string };
                  createdChildren.push({
                    key: childData.key,
                    summary: item.summary,
                    url: `${atlassian.baseUrl}/browse/${childData.key}`,
                  });
                }
              }
            }

            return {
              epicKey: parentCreated.key,
              projectKey: atlassian.projectKey,
              epicTitle,
              subtasks: createdChildren,
              radiusKm: analysis.radiusKm,
              status: "created",
              epicUrl: `${atlassian.baseUrl}/browse/${parentCreated.key}`,
            };
          }
        }
      }
    } catch (error) {
      console.error("[Atlassian Jira Create Error]:", error);
    }
  }

  const draftSubtasks = plannedSubtasks.map((item, index) => ({
    key: `${atlassian?.projectKey ?? "KAN"}-${102 + index}`,
    summary: item.summary,
  }));

  return {
    epicKey: `${atlassian?.projectKey ?? "KAN"}-101`,
    projectKey: atlassian?.projectKey ?? "KAN",
    epicTitle,
    subtasks: draftSubtasks,
    radiusKm: analysis.radiusKm,
    status: "draft",
  };
}

export const handler = async () => ({
  status: "ready",
  tools: [
    "analyzeCompetitors",
    "calculateServiceFee",
    "generateLocalizedCampaign",
    "exportStrategyToConfluence",
    "createJiraMarketingEpics",
  ],
});
