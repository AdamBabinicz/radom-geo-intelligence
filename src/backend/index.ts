import { INDUSTRY_TEMPLATES, type IndustryId } from "../config/industries";
import {
  getMarketMetrics,
  getTownTravelFeePln,
  RADOM_UPHOLSTERY_MARKET,
} from "../config/markets";
import {
  formatTemplate,
  resolveLocale,
  translations,
  type AppDictionary,
  type Locale,
} from "../locales";
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

const CAMPAIGN_KEYS: Record<
  IndustryId,
  {
    headlineKey: keyof AppDictionary;
    audienceKey: keyof AppDictionary;
    offerKey: keyof AppDictionary;
  }
> = {
  upholstery: {
    headlineKey: "campaignUpholsteryHeadline",
    audienceKey: "campaignUpholsteryAudience",
    offerKey: "campaignUpholsteryOffer",
  },
  hvac: {
    headlineKey: "campaignHvacHeadline",
    audienceKey: "campaignHvacAudience",
    offerKey: "campaignHvacOffer",
  },
  plumbing: {
    headlineKey: "campaignPlumbingHeadline",
    audienceKey: "campaignPlumbingAudience",
    offerKey: "campaignPlumbingOffer",
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
  locale?: Locale;
}

export interface CustomerQuoteInput {
  center: string;
  town: string;
  serviceKey: string;
  serviceLabel?: string;
  quantity?: number;
  unitLabel?: string;
  unitPricePln: number;
  travelFeePln: number;
  totalPln: number;
  inZone?: boolean;
  locale?: Locale;
}

export interface CustomerQuoteResult {
  issueKey: string;
  projectKey: string;
  summary: string;
  status: "draft" | "created";
  issueUrl?: string;
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

function getDictLabel(t: AppDictionary, key: string): string {
  return key in t ? String(t[key as keyof AppDictionary]) : key;
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

async function resolveJiraProject(atlassian: AtlassianConfig): Promise<{
  projectKey: string;
  issueTypes: JiraIssueTypeInfo[];
} | null> {
  const fetchProject = async (key: string) =>
    fetch(
      `${atlassian.baseUrl}/rest/api/3/project/${encodeURIComponent(key)}`,
      {
        headers: {
          Authorization: atlassian.authHeader,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      },
    );

  const directRes = await fetchProject(atlassian.projectKey);
  if (directRes.ok) {
    const project = (await directRes.json()) as {
      key?: string;
      issueTypes?: JiraIssueTypeInfo[];
    };
    return {
      projectKey: project.key ?? atlassian.projectKey,
      issueTypes: project.issueTypes ?? [],
    };
  }

  const searchRes = await fetch(
    `${atlassian.baseUrl}/rest/api/3/project/search?maxResults=10`,
    {
      headers: {
        Authorization: atlassian.authHeader,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!searchRes.ok) return null;

  const searchData = (await searchRes.json()) as {
    values?: Array<{ key: string }>;
  };
  const fallbackKey = searchData.values?.[0]?.key;
  if (!fallbackKey) return null;

  const fallbackRes = await fetchProject(fallbackKey);
  if (!fallbackRes.ok) return null;

  const fallbackProject = (await fallbackRes.json()) as {
    key?: string;
    issueTypes?: JiraIssueTypeInfo[];
  };
  return {
    projectKey: fallbackProject.key ?? fallbackKey,
    issueTypes: fallbackProject.issueTypes ?? [],
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

  const locale = resolveLocale(input.locale);
  const t = translations[locale];
  const industry = INDUSTRY_TEMPLATES[input.industryId ?? "upholstery"];
  const metrics = getMarketMetrics(RADOM_UPHOLSTERY_MARKET, input.radiusKm);

  const townsInRadius =
    input.townsInRadius && input.townsInRadius.length > 0
      ? input.townsInRadius
      : [
          input.center.trim(),
          ...metrics.localTowns
            .filter((town) => town.distKm <= input.radiusKm)
            .map((town) => town.name),
        ];

  const serviceableTownsCount = townsInRadius.length;
  const competitorsTracked =
    typeof input.competitorsTracked === "number"
      ? input.competitorsTracked
      : metrics.competitorsTracked;

  const painPoints = industry.painPoints.map((p) => ({
    topic: t[p.topicKey],
    mentions: p.percent,
  }));

  const insights: CompetitorInsight[] = industry.services.map((svc, idx) => ({
    service: t[svc.serviceKey],
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
  locale?: Locale;
}): CampaignSpec {
  if (!input.season.trim() || !input.targetTowns.length) {
    throw new Error("Invalid campaign request");
  }

  const locale = resolveLocale(input.locale);
  const t = translations[locale];
  const industryId = input.industryId ?? "upholstery";
  const keys = CAMPAIGN_KEYS[industryId];

  return {
    season: input.season,
    targetTowns: input.targetTowns,
    headline: formatTemplate(t[keys.headlineKey], { season: input.season }),
    audience: t[keys.audienceKey],
    offer: t[keys.offerKey],
    confluencePageTitle: formatTemplate(t.campaignConfluenceTitleTemplate, {
      season: input.season,
      towns: input.targetTowns.slice(0, 4).join(", "),
    }),
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
  locale?: Locale;
}): Promise<ConfluenceExportResult> {
  const locale = resolveLocale(input.locale);
  const t = translations[locale];
  const industryId = input.industryId ?? "upholstery";
  const template = INDUSTRY_TEMPLATES[industryId];

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
    locale,
  });
  const campaign = generateLocalizedCampaign({
    season: input.season,
    targetTowns: analysis.townsInRadius,
    industryId,
    locale,
  });

  const topPain = t[template.painPoints[0].topicKey];
  const gapText = `${avgGapPct > 0 ? "+" : ""}${avgGapPct}%`;
  const summary = formatTemplate(t.confluenceSummaryTemplate, {
    radius: analysis.radiusKm,
    townsCount: analysis.serviceableTownsCount,
    competitorsCount: analysis.competitorsTracked,
    gap: gapText,
    pain: topPain,
  });

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
            const label = getDictLabel(t, row.serviceKey);
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
          <h1>${escapeHtml(t.brand)} — ${escapeHtml(campaign.headline)}</h1>
          <p><strong>${escapeHtml(t.confluenceServiceHubLabel)}:</strong> ${escapeHtml(analysis.center)} (${analysis.radiusKm} ${escapeHtml(t.kmUnit)})<br/>
          <strong>${escapeHtml(t.confluenceTargetTownsLabel)}:</strong> ${escapeHtml(analysis.townsInRadius.join(", "))}<br/>
          <strong>${escapeHtml(t.confluenceTrackedCompetitorsLabel)}:</strong> ${analysis.competitorsTracked}</p>
          <h2>${escapeHtml(t.confluenceExecSummaryHeading)}</h2>
          <p>${escapeHtml(summary)}</p>
          <p><strong>${escapeHtml(t.confluenceOfferLabel)}:</strong> ${escapeHtml(campaign.offer)}</p>
          <h2>${escapeHtml(t.confluencePricingHeading)}</h2>
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(t.confluenceColService)}</th>
                <th>${escapeHtml(t.confluenceColOurPrice)}</th>
                <th>${escapeHtml(t.confluenceColMarketAvg)}</th>
                <th>${escapeHtml(t.confluenceColDelta)}</th>
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
  locale?: Locale;
}): Promise<JiraEpicResult> {
  const locale = resolveLocale(input.locale);
  const t = translations[locale];
  const analysis = await analyzeCompetitors({
    center: input.center,
    radiusKm: input.radiusKm,
    industryId: input.industryId,
    townsInRadius: input.townsInRadius,
    competitorsTracked: input.competitorsTracked,
    locale,
  });

  const epicTitle = formatTemplate(t.jiraEpicTitleTemplate, {
    center: input.center,
    radius: input.radiusKm,
  });

  const plannedSubtasks = analysis.townsInRadius.slice(0, 4).map((town) => ({
    town,
    summary: formatTemplate(t.jiraSubtaskTemplate, { town }),
  }));

  const atlassian = getAtlassianConfig();
  if (atlassian) {
    try {
      const resolved = await resolveJiraProject(atlassian);
      if (resolved) {
        const allTypes = resolved.issueTypes;
        const standardTypes = allTypes.filter((type) => !type.subtask);
        const epicType = standardTypes.find((type) =>
          /^(epic|epik)$/i.test(type.name),
        );
        const taskType =
          standardTypes.find((type) =>
            /^(task|zadanie|story|historia)$/i.test(type.name),
          ) ?? standardTypes[0];
        const subtaskType = allTypes.find((type) => type.subtask);
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
            project: { key: resolved.projectKey },
            summary: epicTitle,
            issuetype: { id: parentType.id },
            description: buildAdfDocument([
              formatTemplate(t.jiraEpicDescHub, {
                center: analysis.center,
                radius: analysis.radiusKm,
              }),
              formatTemplate(t.jiraEpicDescTowns, {
                towns: analysis.townsInRadius.join(", "),
              }),
              formatTemplate(t.jiraEpicDescCompetitors, {
                count: analysis.competitorsTracked,
              }),
              t.jiraCreatedNote,
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
                  project: { key: resolved.projectKey },
                  summary: item.summary,
                  issuetype: { id: childType.id },
                  description: buildAdfDocument([
                    `${item.town} · ${formatTemplate(t.jiraEpicDescHub, {
                      center: analysis.center,
                      radius: analysis.radiusKm,
                    })}`,
                    `${t.jiraEpicBadge}: ${parentCreated.key}`,
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
              projectKey: resolved.projectKey,
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

export async function createCustomerQuote(
  input: CustomerQuoteInput,
): Promise<CustomerQuoteResult> {
  const locale = resolveLocale(input.locale);
  const t = translations[locale];
  const serviceName =
    input.serviceLabel?.trim() || getDictLabel(t, input.serviceKey);
  const qtySuffix =
    input.unitLabel && typeof input.quantity === "number"
      ? ` (${input.quantity} ${input.unitLabel})`
      : "";

  const summary = `${t.jiraQuotePrefix} ${serviceName}${qtySuffix} · ${input.town} · ${input.totalPln} PLN`;

  const atlassian = getAtlassianConfig();
  if (atlassian) {
    try {
      const resolved = await resolveJiraProject(atlassian);
      if (resolved) {
        const standardTypes = resolved.issueTypes.filter(
          (type) => !type.subtask,
        );
        const taskType =
          standardTypes.find((type) =>
            /^(task|zadanie|story|historia)$/i.test(type.name),
          ) ?? standardTypes[0];

        if (taskType) {
          const issueRes = await fetch(
            `${atlassian.baseUrl}/rest/api/3/issue`,
            {
              method: "POST",
              headers: {
                Authorization: atlassian.authHeader,
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                fields: {
                  project: { key: resolved.projectKey },
                  summary,
                  issuetype: { id: taskType.id },
                  description: buildAdfDocument([
                    `${t.jiraQuoteServiceLabel}: ${serviceName}${qtySuffix}`,
                    `${t.jiraQuoteTownLabel}: ${input.town} (${t.jiraQuoteHubLabel}: ${input.center})`,
                    `${t.jiraQuoteZoneLabel}: ${input.inZone === false ? t.outOfZoneStatus : t.inZoneStatus}`,
                    `${t.jiraQuoteUnitPriceLabel}: ${input.unitPricePln} PLN | ${t.jiraQuoteTravelLabel}: ${input.travelFeePln} PLN`,
                    `${t.jiraQuoteTotalLabel}: ${input.totalPln} PLN`,
                    t.jiraQuoteCreatedNote,
                  ]),
                },
              }),
              signal: AbortSignal.timeout(8000),
            },
          );

          if (issueRes.ok) {
            const created = (await issueRes.json()) as { key: string };
            return {
              issueKey: created.key,
              projectKey: resolved.projectKey,
              summary,
              status: "created",
              issueUrl: `${atlassian.baseUrl}/browse/${created.key}`,
            };
          }
        }
      }
    } catch (error) {
      console.error("[Atlassian Customer Quote Error]:", error);
    }
  }

  return {
    issueKey: `${atlassian?.projectKey ?? "KAN"}-QUOTE`,
    projectKey: atlassian?.projectKey ?? "KAN",
    summary,
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
    "createCustomerQuote",
  ],
});
