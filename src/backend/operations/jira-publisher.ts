import { resolveServiceLabel, type IndustryId } from "../../config/industries";
import {
  formatPrice,
  getLocaleCurrencyConfig,
  normalizeDisplayCurrency,
  type DisplayCurrency,
} from "../../lib/currency";
import {
  formatTemplate,
  resolveLocale,
  translations,
  type Locale,
} from "../../locales";
import type { JiraEpicResult } from "../../types/market";
import {
  ATLASSIAN_TIMEOUT_MS,
  buildAdfDocument,
  getAtlassianConfig,
  readJsonSafe,
  resolveJiraProject,
  type CouncilExecutionContext,
  type CustomerQuoteInput,
  type CustomerQuoteResult,
} from "./atlassian-client";
import { analyzeCompetitors } from "./market-tools";

export async function createJiraMarketingEpics(input: {
  center: string;
  radiusKm: number;
  industryId?: IndustryId;
  townsInRadius?: string[];
  competitorsTracked?: number;
  councilContext?: CouncilExecutionContext;
  locale?: Locale;
  currency?: DisplayCurrency;
}): Promise<JiraEpicResult> {
  const locale = resolveLocale(input.locale);
  const currency = normalizeDisplayCurrency(
    input.currency,
    getLocaleCurrencyConfig(locale).currency,
  );
  const t = translations[locale];
  const analysis = await analyzeCompetitors({
    center: input.center,
    radiusKm: input.radiusKm,
    industryId: input.industryId,
    townsInRadius: input.townsInRadius,
    competitorsTracked: input.competitorsTracked,
    locale,
    currency,
  });

  const ctx = input.councilContext;
  const epicTitle = ctx
    ? `[${input.center} ${input.radiusKm} ${t.kmUnit}] ${ctx.selectedOptionTitle}`.slice(
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
      contextLabel: t.councilJiraActionLabel,
      summary: `${t.councilJiraActionPrefix} ${item}`.slice(0, 200),
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
      `${t.councilApprovedOptionLabel}: ${ctx.selectedOptionTitle}${ctx.selectedOptionSummary ? ` — ${ctx.selectedOptionSummary}` : ""}`,
    );
    if (modelsText) {
      epicParagraphs.push(
        `${t.councilJiraDebateModelsLabel}: ${modelsText}${typeof ctx.riskScore === "number" ? ` (${t.councilJiraCriticRiskLabel}: ${ctx.riskScore}%)` : ""}`,
      );
    }
    if (ctx.humanConstraint?.trim()) {
      epicParagraphs.push(
        `${t.councilHumanRuleLabel}: ${ctx.humanConstraint.trim()}`,
      );
    }
    if (ctx.criticObjections && ctx.criticObjections.length > 0) {
      epicParagraphs.push(
        `${t.councilJiraCriticObjectionLabel}: ${ctx.criticObjections[0]}`,
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
              signal: AbortSignal.timeout(ATLASSIAN_TIMEOUT_MS),
            });

          const parentRes = await createIssue({
            project: { key: resolved.projectKey },
            summary: epicTitle,
            issuetype: { id: parentType.id },
            description: buildAdfDocument(epicParagraphs),
          });

          if (parentRes.ok) {
            const parentCreated = await readJsonSafe<{ key?: string }>(
              parentRes,
            );
            if (parentCreated?.key) {
              const parentKey = parentCreated.key;
              const childType =
                epicType && taskType ? taskType : (subtaskType ?? taskType);

              const createdChildren = childType
                ? (
                    await Promise.all(
                      plannedSubtasks.map(async (item) => {
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
                                  `${t.councilHumanRuleLabel}: ${ctx.humanConstraint.trim()}`,
                                ]
                              : []),
                            `${t.jiraEpicBadge}: ${parentKey}`,
                          ]),
                        };

                        let childRes = await createIssue(
                          useParentLink
                            ? { ...baseFields, parent: { key: parentKey } }
                            : baseFields,
                        );
                        if (!childRes.ok && useParentLink && taskType) {
                          childRes = await createIssue({
                            ...baseFields,
                            issuetype: { id: taskType.id },
                          });
                        }

                        if (!childRes.ok) return null;
                        const childData = await readJsonSafe<{ key?: string }>(
                          childRes,
                        );
                        if (!childData?.key) return null;
                        return {
                          key: childData.key,
                          summary: item.summary,
                          url: `${atlassian.baseUrl}/browse/${childData.key}`,
                        };
                      }),
                    )
                  ).filter(
                    (
                      item,
                    ): item is { key: string; summary: string; url: string } =>
                      item !== null,
                  )
                : [];

              return {
                epicKey: parentKey,
                projectKey: resolved.projectKey,
                epicTitle,
                subtasks: createdChildren,
                radiusKm: analysis.radiusKm,
                status: "created",
                epicUrl: `${atlassian.baseUrl}/browse/${parentKey}`,
              };
            }
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
  const currency = normalizeDisplayCurrency(
    input.currency,
    getLocaleCurrencyConfig(locale).currency,
  );
  const t = translations[locale];
  const serviceName =
    input.serviceLabel?.trim() ||
    resolveServiceLabel({ serviceKey: input.serviceKey }, t, locale);
  const qtySuffix =
    input.unitLabel && typeof input.quantity === "number"
      ? ` (${input.quantity} ${input.unitLabel})`
      : "";
  const formattedUnit = formatPrice(input.unitPricePln, locale, currency);
  const formattedTravel = formatPrice(input.travelFeePln, locale, currency);
  const formattedTotal = formatPrice(input.totalPln, locale, currency);
  const summary = `${t.jiraQuotePrefix} ${serviceName}${qtySuffix} · ${input.town} · ${formattedTotal}`;

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
                    `${t.jiraQuoteUnitPriceLabel}: ${formattedUnit} | ${t.jiraQuoteTravelLabel}: ${formattedTravel}`,
                    `${t.jiraQuoteTotalLabel}: ${formattedTotal}`,
                    t.jiraQuoteCreatedNote,
                  ]),
                },
              }),
              signal: AbortSignal.timeout(ATLASSIAN_TIMEOUT_MS),
            },
          );

          if (issueRes.ok) {
            const created = await readJsonSafe<{ key?: string }>(issueRes);
            if (created?.key) {
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
