import {
  INDUSTRY_TEMPLATES,
  resolveServiceLabel,
  type IndustryId,
} from "../config/industries";
import {
  getMarketMetrics,
  getTownTravelFeePln,
  RADOM_UPHOLSTERY_MARKET,
} from "../config/markets";
import { estimateZoneTravelFeePln } from "../lib/geo-math";
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
  serviceLabel?: string;
  ourPricePln: number;
  localPricePln: number;
}

export interface CouncilExecutionContext {
  selectedOptionTitle: string;
  selectedOptionSummary?: string;
  strategistModel?: string;
  criticModel?: string;
  riskScore?: number;
  criticObjections?: string[];
  humanConstraint?: string;
  actionItems?: string[];
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
  const safeParagraphs = paragraphs
    .map((text) => text.trim())
    .filter((text) => text.length > 0);
  return {
    type: "doc",
    version: 1,
    content: safeParagraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

function buildConfluenceCouncilSection(
  ctx: CouncilExecutionContext,
  locale: Locale,
): string {
  const isPl = locale === "pl";
  const heading = isPl
    ? "Protokół Rady Strategicznej AI i decyzja operatora"
    : "AI Strategy Council Protocol & Human Decision";
  const modelsText = [ctx.strategistModel, ctx.criticModel]
    .filter(Boolean)
    .join(" ↔ ");

  const metaLines: string[] = [
    `<p><strong>${escapeHtml(isPl ? "Zatwierdzony wariant" : "Approved option")}:</strong> ${escapeHtml(ctx.selectedOptionTitle)}${ctx.selectedOptionSummary ? ` — ${escapeHtml(ctx.selectedOptionSummary)}` : ""}</p>`,
  ];

  if (modelsText) {
    const riskPart =
      typeof ctx.riskScore === "number"
        ? ` · ${isPl ? "Wskaźnik ryzyka krytyka" : "Critic risk score"}: ${ctx.riskScore}%`
        : "";
    metaLines.push(
      `<p><strong>${escapeHtml(isPl ? "Debata modeli AI" : "AI debate models")}:</strong> ${escapeHtml(modelsText)}${escapeHtml(riskPart)}</p>`,
    );
  }

  if (ctx.humanConstraint?.trim()) {
    metaLines.push(
      `<p><strong>${escapeHtml(isPl ? "Reguła / limit operatora" : "Human operator rule")}:</strong> ${escapeHtml(ctx.humanConstraint.trim())}</p>`,
    );
  }

  const objectionsBlock =
    ctx.criticObjections && ctx.criticObjections.length > 0
      ? `<h3>${escapeHtml(isPl ? "Kluczowe zastrzeżenia Krytyka" : "Key Critic objections")}</h3><ul>${ctx.criticObjections
          .slice(0, 4)
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul>`
      : "";

  const actionsBlock =
    ctx.actionItems && ctx.actionItems.length > 0
      ? `<h3>${escapeHtml(isPl ? "Plan wdrożenia zatwierdzony do Jira" : "Approved action plan for Jira")}</h3><ol>${ctx.actionItems
          .slice(0, 5)
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ol>`
      : "";

  return `<h2>${escapeHtml(heading)}</h2>${metaLines.join("")}${objectionsBlock}${actionsBlock}`;
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
  const centerTrimmed = input.center.trim();
  const isRadomReference =
    centerTrimmed.toLowerCase() ===
    RADOM_UPHOLSTERY_MARKET.centerName.toLowerCase();
  const metrics = getMarketMetrics(RADOM_UPHOLSTERY_MARKET, input.radiusKm);

  const townsInRadius =
    input.townsInRadius && input.townsInRadius.length > 0
      ? input.townsInRadius
      : isRadomReference
        ? [
            centerTrimmed,
            ...metrics.localTowns
              .filter((town) => town.distKm <= input.radiusKm)
              .map((town) => town.name),
          ]
        : [centerTrimmed];

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
    service: resolveServiceLabel(svc, t, locale),
    averagePricePln: svc.localPricePln,
    ourPricePln: svc.ourPricePln,
    sourceStatus: "demo",
    reviewPainPoints: painPoints.slice(idx % 2, (idx % 2) + 2),
  }));

  return {
    center: centerTrimmed,
    radiusKm: input.radiusKm,
    serviceableTownsCount,
    competitorsTracked,
    townsInRadius,
    sourceStatus: "demo",
    insights,
  };
}

export function calculateServiceFee(input: ServiceFeeInput): ServiceFeeQuote {
  const cleanTown = input.town.trim();
  if (
    !cleanTown ||
    !Number.isFinite(input.orderValue) ||
    input.orderValue < 0
  ) {
    throw new Error("Invalid service fee input");
  }

  const lowerTown = cleanTown.toLowerCase();
  const matchedRadomTown = RADOM_UPHOLSTERY_MARKET.towns.find(
    (t) => !t.isRegionalHub && t.name.toLowerCase() === lowerTown,
  );
  const hasExplicitDistance =
    typeof input.distanceKm === "number" &&
    Number.isFinite(input.distanceKm) &&
    input.distanceKm >= 0;

  let distanceKm = 0;
  let travelFeePln = 0;

  if (hasExplicitDistance) {
    distanceKm = Math.min(500, Math.round(input.distanceKm! * 10) / 10);
    travelFeePln = estimateZoneTravelFeePln(distanceKm);
  } else if (matchedRadomTown) {
    distanceKm = matchedRadomTown.distKm;
    travelFeePln = getTownTravelFeePln(
      RADOM_UPHOLSTERY_MARKET,
      matchedRadomTown.name,
    );
  }

  return {
    town: matchedRadomTown ? matchedRadomTown.name : cleanTown,
    orderValue: input.orderValue,
    distanceKm,
    travelFeePln,
    totalPln: Math.round((input.orderValue + travelFeePln) * 100) / 100,
    sourceStatus: "computed",
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
  councilContext?: CouncilExecutionContext;
  topPainPoint?: string;
  detectedIndustryLabel?: string;
  locale?: Locale;
}): Promise<ConfluenceExportResult> {
  const locale = resolveLocale(input.locale);
  const isPl = locale === "pl";
  const t = translations[locale];
  const industryId = input.industryId ?? "upholstery";
  const template = INDUSTRY_TEMPLATES[industryId];

  const activeBenchmarks: ServiceBenchmarkInput[] =
    input.benchmarks && input.benchmarks.length > 0
      ? input.benchmarks
      : template.services.map((s) => ({
          serviceKey: s.serviceKey,
          serviceLabel: resolveServiceLabel(s, t, locale),
          ourPricePln: s.ourPricePln,
          localPricePln: s.localPricePln,
        }));

  const hasLiveCustomBenchmarks =
    activeBenchmarks.length > 0 &&
    activeBenchmarks.every((b) => b.serviceKey.startsWith("live:"));

  const comparableBenchmarks = activeBenchmarks.filter(
    (s) => s.localPricePln > 0,
  );
  const avgGapPct = comparableBenchmarks.length
    ? Math.round(
        comparableBenchmarks.reduce(
          (acc, s) =>
            acc + ((s.ourPricePln - s.localPricePln) / s.localPricePln) * 100,
          0,
        ) / comparableBenchmarks.length,
      )
    : 0;

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

  const ctx = input.councilContext;
  const topTownsShort = analysis.townsInRadius.slice(0, 4).join(", ");
  const pageTitle = ctx
    ? isPl
      ? `Strategia Rady AI (${ctx.selectedOptionTitle}) — ${topTownsShort}`
      : `AI Council Strategy (${ctx.selectedOptionTitle}) — ${topTownsShort}`
    : hasLiveCustomBenchmarks
      ? isPl
        ? `Strategia lokalna (${input.detectedIndustryLabel || analysis.center}) — ${topTownsShort}`
        : `Local Strategy (${input.detectedIndustryLabel || analysis.center}) — ${topTownsShort}`
      : campaign.confluencePageTitle;

  const pageHeadline = ctx
    ? `${t.brand} — ${isPl ? "Rada Strategiczna AI" : "AI Strategy Council"}: ${ctx.selectedOptionTitle}`
    : hasLiveCustomBenchmarks
      ? `${t.brand} — ${input.detectedIndustryLabel || analysis.center} (${analysis.radiusKm} ${t.kmUnit})`
      : `${t.brand} — ${campaign.headline}`;

  const topPain =
    input.topPainPoint?.trim() ||
    ctx?.criticObjections?.[0]?.trim() ||
    (hasLiveCustomBenchmarks
      ? isPl
        ? "przejrzystość stawek i szybkość wyceny online"
        : "transparent online pricing and faster quoting"
      : t[template.painPoints[0].topicKey]);

  const valueProposition =
    ctx?.selectedOptionSummary?.trim() ||
    (hasLiveCustomBenchmarks
      ? isPl
        ? "Przejrzysty cennik online dopasowany do lokalnego rynku oraz jasne warunki dojazdu w strefie."
        : "Transparent online pricing aligned with local benchmarks and clear zone travel terms."
      : campaign.offer);

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
            const label =
              row.serviceLabel?.trim() ||
              resolveServiceLabel({ serviceKey: row.serviceKey }, t, locale);
            const hasLocalAvg = row.localPricePln > 0;
            const delta = hasLocalAvg
              ? Math.round(
                  ((row.ourPricePln - row.localPricePln) / row.localPricePln) *
                    100,
                )
              : 0;
            const marketAvgCell = hasLocalAvg
              ? `${row.localPricePln} PLN`
              : "—";
            const deltaStr = hasLocalAvg
              ? `${delta > 0 ? "+" : ""}${delta}%`
              : "—";
            return `<tr><td>${escapeHtml(label)}</td><td>${row.ourPricePln} PLN</td><td>${escapeHtml(marketAvgCell)}</td><td>${escapeHtml(deltaStr)}</td></tr>`;
          })
          .join("");

        const councilSectionHtml = ctx
          ? buildConfluenceCouncilSection(ctx, locale)
          : "";

        const storageHtml = `
          <h1>${escapeHtml(pageHeadline)}</h1>
          <p><strong>${escapeHtml(t.confluenceServiceHubLabel)}:</strong> ${escapeHtml(analysis.center)} (${analysis.radiusKm} ${escapeHtml(t.kmUnit)})<br/>
          <strong>${escapeHtml(t.confluenceTargetTownsLabel)}:</strong> ${escapeHtml(analysis.townsInRadius.join(", "))}<br/>
          <strong>${escapeHtml(t.confluenceTrackedCompetitorsLabel)}:</strong> ${analysis.competitorsTracked}</p>
          <h2>${escapeHtml(t.confluenceExecSummaryHeading)}</h2>
          <p>${escapeHtml(summary)}</p>
          <p><strong>${escapeHtml(t.confluenceOfferLabel)}:</strong> ${escapeHtml(valueProposition)}</p>
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
          ${councilSectionHtml}
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

        let finalTitle = pageTitle;
        let createRes = await publishPage(finalTitle);

        if (createRes.status === 400) {
          const suffix = new Date()
            .toISOString()
            .slice(11, 19)
            .replace(/:/g, "");
          finalTitle = `${pageTitle} [${suffix}]`;
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
    pageTitle,
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
  councilContext?: CouncilExecutionContext;
  locale?: Locale;
}): Promise<JiraEpicResult> {
  const locale = resolveLocale(input.locale);
  const isPl = locale === "pl";
  const t = translations[locale];
  const analysis = await analyzeCompetitors({
    center: input.center,
    radiusKm: input.radiusKm,
    industryId: input.industryId,
    townsInRadius: input.townsInRadius,
    competitorsTracked: input.competitorsTracked,
    locale,
  });

  const ctx = input.councilContext;
  const epicTitle = ctx
    ? `[${input.center} ${input.radiusKm} km] ${ctx.selectedOptionTitle}`.slice(
        0,
        220,
      )
    : formatTemplate(t.jiraEpicTitleTemplate, {
        center: input.center,
        radius: input.radiusKm,
      });

  const councilActionSubtasks = (ctx?.actionItems ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((item) => ({
      contextLabel: isPl ? "Akcja z Rady AI" : "AI Council Action",
      summary: `${isPl ? "[Rada AI]" : "[AI Council]"} ${item}`.slice(0, 200),
    }));

  const townLimit = councilActionSubtasks.length > 0 ? 2 : 4;
  const townSubtasks = analysis.townsInRadius
    .slice(0, townLimit)
    .map((town) => ({
      contextLabel: town,
      summary: formatTemplate(t.jiraSubtaskTemplate, { town }),
    }));

  const plannedSubtasks = [...councilActionSubtasks, ...townSubtasks];

  const epicParagraphs = [
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
  ];

  if (ctx) {
    const modelsText = [ctx.strategistModel, ctx.criticModel]
      .filter(Boolean)
      .join(" ↔ ");
    epicParagraphs.push(
      `${isPl ? "Wybrany wariant Rady AI" : "Approved AI Council option"}: ${ctx.selectedOptionTitle}${ctx.selectedOptionSummary ? ` — ${ctx.selectedOptionSummary}` : ""}`,
    );
    if (modelsText) {
      epicParagraphs.push(
        `${isPl ? "Debata modeli" : "Debate models"}: ${modelsText}${typeof ctx.riskScore === "number" ? ` (${isPl ? "Ryzyko krytyka" : "Critic risk"}: ${ctx.riskScore}%)` : ""}`,
      );
    }
    if (ctx.humanConstraint?.trim()) {
      epicParagraphs.push(
        `${isPl ? "Reguła operatora" : "Human rule"}: ${ctx.humanConstraint.trim()}`,
      );
    }
    if (ctx.criticObjections && ctx.criticObjections.length > 0) {
      epicParagraphs.push(
        `${isPl ? "Zastrzeżenie Krytyka" : "Critic objection"}: ${ctx.criticObjections[0]}`,
      );
    }
  }

  epicParagraphs.push(t.jiraCreatedNote);

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
            description: buildAdfDocument(epicParagraphs),
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
                    `${item.contextLabel} · ${formatTemplate(
                      t.jiraEpicDescHub,
                      {
                        center: analysis.center,
                        radius: analysis.radiusKm,
                      },
                    )}`,
                    ...(ctx?.humanConstraint?.trim()
                      ? [
                          `${isPl ? "Reguła operatora" : "Operator rule"}: ${ctx.humanConstraint.trim()}`,
                        ]
                      : []),
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
    input.serviceLabel?.trim() ||
    resolveServiceLabel({ serviceKey: input.serviceKey }, t, locale);
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
