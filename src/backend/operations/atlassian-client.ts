import type { IndustryId } from "../../config/industries";
import type { AppDictionary, Locale } from "../../locales";
import type { CompetitorAnalysisInput } from "../../types/market";

export const ATLASSIAN_TIMEOUT_MS = 8000;

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

export interface AtlassianConfig {
  baseUrl: string;
  authHeader: string;
  spaceKey: string;
  projectKey: string;
}

export interface JiraIssueTypeInfo {
  id: string;
  name: string;
  subtask: boolean;
}

export async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    const raw = await response.text();
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getAtlassianConfig(): AtlassianConfig | null {
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

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAdfDocument(paragraphs: string[]) {
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

export function buildConfluenceCouncilSection(
  ctx: CouncilExecutionContext,
  t: AppDictionary,
): string {
  const modelsText = [ctx.strategistModel, ctx.criticModel]
    .filter(Boolean)
    .join(" ↔ ");

  const metaLines: string[] = [
    `<p><strong>${escapeHtml(t.councilApprovedOptionLabel)}:</strong> ${escapeHtml(ctx.selectedOptionTitle)}${ctx.selectedOptionSummary ? ` — ${escapeHtml(ctx.selectedOptionSummary)}` : ""}</p>`,
  ];

  if (modelsText) {
    const riskPart =
      typeof ctx.riskScore === "number"
        ? ` · ${t.councilCriticRiskScoreLabel}: ${ctx.riskScore}%`
        : "";
    metaLines.push(
      `<p><strong>${escapeHtml(t.councilDebateModelsLabel)}:</strong> ${escapeHtml(modelsText)}${escapeHtml(riskPart)}</p>`,
    );
  }

  if (ctx.humanConstraint?.trim()) {
    metaLines.push(
      `<p><strong>${escapeHtml(t.councilHumanRuleLabel)}:</strong> ${escapeHtml(ctx.humanConstraint.trim())}</p>`,
    );
  }

  const objectionsBlock =
    ctx.criticObjections && ctx.criticObjections.length > 0
      ? `<h3>${escapeHtml(t.councilKeyCriticObjectionsHeading)}</h3><ul>${ctx.criticObjections
          .slice(0, 4)
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul>`
      : "";

  const actionsBlock =
    ctx.actionItems && ctx.actionItems.length > 0
      ? `<h3>${escapeHtml(t.councilApprovedActionPlanHeading)}</h3><ol>${ctx.actionItems
          .slice(0, 5)
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ol>`
      : "";

  return `<h2>${escapeHtml(t.councilProtocolHeading)}</h2>${metaLines.join("")}${objectionsBlock}${actionsBlock}`;
}

export async function resolveJiraProject(atlassian: AtlassianConfig): Promise<{
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
        signal: AbortSignal.timeout(ATLASSIAN_TIMEOUT_MS),
      },
    );

  const directRes = await fetchProject(atlassian.projectKey);
  if (directRes.ok) {
    const project = await readJsonSafe<{
      key?: string;
      issueTypes?: JiraIssueTypeInfo[];
    }>(directRes);
    if (project) {
      return {
        projectKey: project.key ?? atlassian.projectKey,
        issueTypes: project.issueTypes ?? [],
      };
    }
  }

  const searchRes = await fetch(
    `${atlassian.baseUrl}/rest/api/3/project/search?maxResults=10`,
    {
      headers: {
        Authorization: atlassian.authHeader,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(ATLASSIAN_TIMEOUT_MS),
    },
  );
  if (!searchRes.ok) return null;

  const searchData = await readJsonSafe<{
    values?: Array<{ key: string }>;
  }>(searchRes);
  const fallbackKey = searchData?.values?.[0]?.key;
  if (!fallbackKey) return null;

  const fallbackRes = await fetchProject(fallbackKey);
  if (!fallbackRes.ok) return null;
  const fallbackProject = await readJsonSafe<{
    key?: string;
    issueTypes?: JiraIssueTypeInfo[];
  }>(fallbackRes);
  if (!fallbackProject) return null;
  return {
    projectKey: fallbackProject.key ?? fallbackKey,
    issueTypes: fallbackProject.issueTypes ?? [],
  };
}
