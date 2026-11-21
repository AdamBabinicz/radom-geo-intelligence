import {
  INDUSTRY_TEMPLATES,
  resolveServiceLabel,
  type IndustryId,
} from "../../config/industries";
import {
  formatTemplate,
  resolveLocale,
  translations,
  type Locale,
} from "../../locales";
import type { ConfluenceExportResult } from "../../types/market";
import {
  ATLASSIAN_TIMEOUT_MS,
  buildConfluenceCouncilSection,
  escapeHtml,
  getAtlassianConfig,
  readJsonSafe,
  type CouncilExecutionContext,
  type ServiceBenchmarkInput,
} from "./atlassian-client";
import { analyzeCompetitors, generateLocalizedCampaign } from "./market-tools";

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
  const isCustomNiche =
    Boolean(input.detectedIndustryLabel?.trim()) || hasLiveCustomBenchmarks;

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
    ? formatTemplate(t.councilConfluenceTitleTemplate, {
        option: ctx.selectedOptionTitle,
        towns: topTownsShort,
      })
    : isCustomNiche
      ? formatTemplate(t.councilLocalStrategyTitleTemplate, {
          label: input.detectedIndustryLabel || analysis.center,
          towns: topTownsShort,
        })
      : campaign.confluencePageTitle;

  const pageHeadline = ctx
    ? `${t.brand} — ${t.councilTitle}: ${ctx.selectedOptionTitle}`
    : isCustomNiche
      ? `${t.brand} — ${input.detectedIndustryLabel || analysis.center} (${analysis.radiusKm} ${t.kmUnit})`
      : `${t.brand} — ${campaign.headline}`;

  const rawTopPain =
    input.topPainPoint?.trim() ||
    (isCustomNiche
      ? t.councilCustomPainFallback
      : t[template.painPoints[0].topicKey]);
  const topPain = rawTopPain.replace(/[.!?\s]+$/, "");

  const valueProposition =
    ctx?.selectedOptionSummary?.trim() ||
    (isCustomNiche ? t.councilCustomOfferFallback : campaign.offer);

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
          signal: AbortSignal.timeout(ATLASSIAN_TIMEOUT_MS),
        },
      );
      if (byKeyRes.ok) {
        const data = await readJsonSafe<{
          results?: Array<{ id: string; key: string }>;
        }>(byKeyRes);
        if (data?.results && data.results.length > 0) {
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
            signal: AbortSignal.timeout(ATLASSIAN_TIMEOUT_MS),
          },
        );
        if (listRes.ok) {
          const listData = await readJsonSafe<{
            results?: Array<{ id: string; key: string }>;
          }>(listRes);
          if (listData?.results && listData.results.length > 0) {
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
          ? buildConfluenceCouncilSection(ctx, t)
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
            signal: AbortSignal.timeout(ATLASSIAN_TIMEOUT_MS),
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
          const created = await readJsonSafe<{
            title?: string;
            _links?: { webui?: string };
          }>(createRes);
          const pageUrl = created?._links?.webui
            ? `${atlassian.baseUrl}/wiki${created._links.webui}`
            : `${atlassian.baseUrl}/wiki/spaces/${resolvedSpaceKey}`;

          return {
            pageTitle: created?.title ?? finalTitle,
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
