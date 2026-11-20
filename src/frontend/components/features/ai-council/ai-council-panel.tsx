"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  History,
  Scale,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import type {
  CouncilDebateResult,
  CouncilDecisionOption,
} from "@/src/backend/ai/council-engine";
import type { CouncilExecutionContext } from "@/src/backend/index";
import {
  INDUSTRY_TEMPLATES,
  resolveServiceLabel,
  resolveUnitType,
  type IndustryId,
} from "@/src/config/industries";
import type { MarketProfile } from "@/src/config/markets";
import { formatPrice } from "@/src/lib/currency";
import { formatTemplate, type AppDictionary, type Locale } from "@/src/locales";
import type {
  ConfluenceExportResult,
  JiraEpicResult,
} from "@/src/types/market";
import type { LiveMarketScanResult } from "../competitor-table/competitor-table";

const LESSONS_STORAGE_KEY = "northstar_council_lessons_v1";
const COUNCIL_REQUEST_TIMEOUT_MS = 55_000;
const PUBLISH_REQUEST_TIMEOUT_MS = 30_000;

interface AiCouncilPanelProps {
  t: AppDictionary;
  market: MarketProfile;
  locale: Locale;
  industryId: IndustryId;
  detectedIndustryLabel?: string;
  radiusKm: number;
  avgGapPct: number;
  townsInRadius: string[];
  liveScan: (LiveMarketScanResult & { detectedIndustryLabel?: string }) | null;
}

interface McpJsonRpcResponse<T> {
  result?: {
    structuredContent?: T;
  };
  error?: {
    code?: number;
    message?: string;
  };
}

function toSafeHttpUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    const raw = await response.text();
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isTimeoutFailure(error: unknown, status?: number): boolean {
  if (status === 408 || status === 504) {
    return true;
  }
  if (error instanceof DOMException) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      message.includes("timed out") ||
      message.includes("timeout")
    );
  }
  return false;
}

export function AiCouncilPanel({
  t,
  market,
  locale,
  industryId,
  detectedIndustryLabel,
  radiusKm,
  avgGapPct,
  townsInRadius,
  liveScan,
}: AiCouncilPanelProps) {
  const [humanNote, setHumanNote] = useState("");
  const [lessons, setLessons] = useState<string[]>([]);
  const [isDebating, setIsDebating] = useState(false);
  const [debateError, setDebateError] = useState<string | null>(null);
  const [debate, setDebate] = useState<CouncilDebateResult | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<"safe" | "margin">(
    "safe",
  );

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedConfluence, setPublishedConfluence] =
    useState<ConfluenceExportResult | null>(null);
  const [publishedJira, setPublishedJira] = useState<JiraEpicResult | null>(
    null,
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LESSONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          setLessons(
            parsed.filter((item): item is string => typeof item === "string"),
          );
        }
      }
    } catch {
      // Ignore malformed localStorage entries
    }
  }, []);

  const persistLessons = (next: string[]) => {
    setLessons(next);
    try {
      window.localStorage.setItem(LESSONS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota issues
    }
  };

  const activeIndustry = INDUSTRY_TEMPLATES[industryId];
  const presetKeys = new Set(activeIndustry.services.map((s) => s.serviceKey));
  const hasPresetOverlap = market.benchmarks.some((row) =>
    presetKeys.has(row.serviceKey),
  );
  const hasLiveServices = market.benchmarks.some((row) =>
    row.serviceKey.startsWith("live:"),
  );
  const resolvedDetectedLabel =
    liveScan?.detectedIndustryLabel?.trim() ||
    detectedIndustryLabel?.trim() ||
    undefined;
  const isCustomLiveNiche =
    Boolean(resolvedDetectedLabel) || (hasLiveServices && !hasPresetOverlap);

  const handleRunCouncil = async () => {
    setIsDebating(true);
    setDebateError(null);
    setPublishedConfluence(null);
    setPublishedJira(null);

    const painPoints =
      liveScan?.aiEnhanced && liveScan.painPoints.length > 0
        ? liveScan.painPoints.map((p) => ({
            label: p.label,
            score: p.severityScore,
            evidence: p.evidence,
          }))
        : isCustomLiveNiche
          ? []
          : activeIndustry.painPoints.map((p) => ({
              label: t[p.topicKey],
              score: p.percent,
            }));

    const competitors = (liveScan?.competitors ?? []).map((c) => ({
      name: c.name,
      rating: c.rating,
      reviewCount: c.reviewCount,
      priceSummary: c.priceSummary,
      travelFeeNote: c.travelFeeNote,
    }));

    try {
      const response = await fetch("/api/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(COUNCIL_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          city: market.centerName,
          industryId,
          industryLabel: resolvedDetectedLabel || t[activeIndustry.labelKey],
          radiusKm,
          locale,
          avgGapPct,
          townsInRadius,
          services: market.benchmarks.map((row) => ({
            serviceKey: row.serviceKey,
            label: resolveServiceLabel(row, t, locale),
            unitType: resolveUnitType(row),
            ourPricePln: row.ourPricePln,
            localPricePln: row.localPricePln,
          })),
          competitors,
          painPoints,
          humanNote: humanNote.trim() || undefined,
          lessonsLearned: lessons,
        }),
      });
      const data = await readJsonSafe<CouncilDebateResult & { error?: string }>(
        response,
      );
      if (!response.ok || !data?.round1Strategist) {
        if (isTimeoutFailure(null, response.status)) {
          setDebateError(t.councilTimeoutError);
          return;
        }
        setDebateError(
          data?.error ??
            (response.ok
              ? t.councilErrorGeneric
              : formatTemplate(t.councilHttpError, {
                  status: response.status,
                })),
        );
        return;
      }
      setDebate(data);
      setSelectedOptionId("safe");
    } catch (err) {
      setDebateError(
        isTimeoutFailure(err) ? t.councilTimeoutError : t.councilErrorGeneric,
      );
    } finally {
      setIsDebating(false);
    }
  };

  const handleApproveAndPublish = async () => {
    if (!debate) return;
    const chosen: CouncilDecisionOption | undefined =
      debate.round3Synthesis.options.find((o) => o.id === selectedOptionId) ??
      debate.round3Synthesis.options[0];
    if (!chosen) {
      setDebateError(t.councilErrorGeneric);
      return;
    }

    setIsPublishing(true);
    setDebateError(null);

    const adjustedMap = new Map(
      chosen.priceAdjustments.map((a) => [a.serviceKey, a.finalPricePln]),
    );
    const updatedBenchmarks = market.benchmarks.map((row) => ({
      serviceKey: row.serviceKey,
      serviceLabel: resolveServiceLabel(row, t, locale),
      ourPricePln: adjustedMap.get(row.serviceKey) ?? row.ourPricePln,
      localPricePln: row.localPricePln,
    }));

    const competitorsCount =
      liveScan?.competitors.length || Math.max(1, market.baseCompetitorsCount);
    const topPainPoint =
      liveScan?.aiEnhanced && liveScan.painPoints.length > 0
        ? liveScan.painPoints[0].label
        : undefined;

    const trimmedNote = humanNote.trim();
    const councilContext: CouncilExecutionContext = {
      selectedOptionTitle: chosen.title,
      selectedOptionSummary: chosen.summary,
      strategistModel: debate.models.strategist,
      criticModel: debate.models.critic,
      riskScore: debate.round2Critic.riskScore,
      criticObjections: debate.round2Critic.objections,
      humanConstraint: trimmedNote || undefined,
      actionItems: chosen.actionItems,
    };

    try {
      const [confRes, jiraRes] = await Promise.all([
        fetch("/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(PUBLISH_REQUEST_TIMEOUT_MS),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: {
              name: "exportStrategyToConfluence",
              arguments: {
                center: market.centerName,
                radiusKm,
                season: "Q4",
                industryId,
                ...(resolvedDetectedLabel
                  ? { detectedIndustryLabel: resolvedDetectedLabel }
                  : {}),
                ...(topPainPoint ? { topPainPoint } : {}),
                townsInRadius,
                competitorsTracked: competitorsCount,
                benchmarks: updatedBenchmarks,
                councilContext,
                locale,
              },
            },
          }),
        }),
        fetch("/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(PUBLISH_REQUEST_TIMEOUT_MS),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now() + 1,
            method: "tools/call",
            params: {
              name: "createJiraMarketingEpics",
              arguments: {
                center: market.centerName,
                radiusKm,
                industryId,
                townsInRadius,
                competitorsTracked: competitorsCount,
                councilContext,
                locale,
              },
            },
          }),
        }),
      ]);

      const [confJson, jiraJson] = await Promise.all([
        readJsonSafe<McpJsonRpcResponse<ConfluenceExportResult>>(confRes),
        readJsonSafe<McpJsonRpcResponse<JiraEpicResult>>(jiraRes),
      ]);

      if (!confRes.ok || !jiraRes.ok) {
        const failedStatus = !confRes.ok ? confRes.status : jiraRes.status;
        if (isTimeoutFailure(null, failedStatus)) {
          setDebateError(t.councilPublishTimeoutError);
          return;
        }
        const serverMessage =
          confJson?.error?.message || jiraJson?.error?.message;
        setDebateError(
          serverMessage ??
            formatTemplate(t.councilPublishHttpError, { status: failedStatus }),
        );
        return;
      }

      if (confJson?.error?.message || jiraJson?.error?.message) {
        setDebateError(
          confJson?.error?.message ||
            jiraJson?.error?.message ||
            t.councilPublishErrorGeneric,
        );
        return;
      }

      const confluenceResult = confJson?.result?.structuredContent ?? null;
      const jiraResult = jiraJson?.result?.structuredContent ?? null;

      if (!confluenceResult && !jiraResult) {
        setDebateError(t.councilPublishErrorGeneric);
        return;
      }

      if (confluenceResult) {
        setPublishedConfluence(confluenceResult);
      }
      if (jiraResult) {
        setPublishedJira(jiraResult);
      }

      const newLessonSummary = trimmedNote
        ? formatTemplate(t.councilLessonWithNote, {
            city: market.centerName,
            note: trimmedNote,
            option: chosen.title,
          })
        : formatTemplate(t.councilLessonRadiusOnly, {
            city: market.centerName,
            radiusKm,
            option: chosen.title,
          });

      const nextLessons = Array.from(
        new Set([newLessonSummary, ...lessons]),
      ).slice(0, 6);
      persistLessons(nextLessons);
    } catch (err) {
      setDebateError(
        isTimeoutFailure(err)
          ? t.councilPublishTimeoutError
          : t.councilPublishErrorGeneric,
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const verdictLabel = (verdict: "challenge" | "revise" | "caution") => {
    if (verdict === "challenge") return t.councilCriticChallenge;
    if (verdict === "caution") return t.councilCriticCaution;
    return t.councilCriticRevise;
  };

  const confluenceHref = toSafeHttpUrl(publishedConfluence?.pageUrl);
  const jiraHref = toSafeHttpUrl(publishedJira?.epicUrl);

  return (
    <section
      id="council"
      className="mt-5 rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(20,40,45,.025)] dark:border-slate-800 dark:bg-[#172123]"
    >
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800 md:flex-row md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[.14em] text-teal-700 dark:text-teal-300">
              {t.councilEyebrow}
            </span>
            <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/70 dark:text-teal-200">
              {t.councilBadge}
            </span>
          </div>
          <h2 className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <BrainCircuit
              size={18}
              className="text-teal-700 dark:text-teal-300"
            />
            {t.councilTitle}
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {t.councilSubtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunCouncil}
          disabled={isDebating}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60"
        >
          <Sparkles size={15} />
          {isDebating ? t.councilRunningBtn : t.councilRunBtn}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div>
          <label
            htmlFor="council-human-constraint"
            className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300"
          >
            <UserCheck size={13} className="text-teal-700 dark:text-teal-300" />
            {t.councilHumanConstraintLabel}
          </label>
          <input
            id="council-human-constraint"
            type="text"
            value={humanNote}
            onChange={(e) => setHumanNote(e.target.value)}
            placeholder={t.councilHumanConstraintPlaceholder}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-xs text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:border-teal-400"
          />
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              <History size={13} className="text-teal-700 dark:text-teal-300" />
              {t.councilLessonsTitle}
            </span>
            {lessons.length > 0 && (
              <button
                type="button"
                onClick={() => persistLessons([])}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
              >
                <Trash2 size={11} />
                {t.councilLessonsClear}
              </button>
            )}
          </div>
          {lessons.length === 0 ? (
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
              {t.councilLessonsEmpty}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1 text-[10px] text-slate-700 dark:text-slate-300">
              {lessons.slice(0, 3).map((lesson) => (
                <li key={lesson} className="truncate">
                  • {lesson}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {debateError && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{debateError}</span>
        </div>
      )}

      {debate && (
        <div className="mt-5 space-y-4">
          {!debate.aiEnhanced && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{debate.fallbackNotice || t.councilFallbackNotice}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className={`rounded-md px-2 py-0.5 font-semibold ${
                debate.crossProviderUsed
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {debate.crossProviderUsed
                ? t.councilCrossProviderLive
                : t.councilSingleProviderHint}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {debate.models.strategist} ↔ {debate.models.critic}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <article className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Bot size={14} className="text-teal-700 dark:text-teal-300" />
                  {t.councilRound1Title}
                </h3>
                <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {debate.models.strategist}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {debate.round1Strategist.thesis}
              </p>
              {debate.round1Strategist.campaignAngle && (
                <p className="mt-2 rounded-md bg-white px-2.5 py-1.5 text-[11px] font-medium text-teal-800 dark:bg-slate-800 dark:text-teal-200">
                  {debate.round1Strategist.campaignAngle}
                </p>
              )}
              {debate.round1Strategist.priceMoves.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {debate.round1Strategist.priceMoves.map((move) => (
                    <li
                      key={move.serviceKey}
                      className="rounded-md border border-slate-200/70 bg-white px-2.5 py-1.5 text-[11px] dark:border-slate-800 dark:bg-[#172123]"
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold">
                        <span className="truncate text-slate-800 dark:text-slate-100">
                          {move.label}
                        </span>
                        <span className="shrink-0 text-teal-700 dark:text-teal-300">
                          {formatPrice(move.currentPricePln, locale)} →{" "}
                          {formatPrice(move.proposedPricePln, locale)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                        {move.rationale}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Scale
                    size={14}
                    className="text-amber-700 dark:text-amber-300"
                  />
                  {t.councilRound2Title}
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                    {verdictLabel(debate.round2Critic.verdict)} ·{" "}
                    {t.councilRiskScoreLabel}: {debate.round2Critic.riskScore}%
                  </span>
                </div>
              </div>

              <div className="mt-3 space-y-3 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    {t.councilObjectionsLabel}
                  </p>
                  <ul className="mt-1 space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                    {debate.round2Critic.objections.map((obj) => (
                      <li key={obj}>• {obj}</li>
                    ))}
                  </ul>
                </div>
                {debate.round2Critic.counterProposals.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                      {t.councilCounterMovesLabel}
                    </p>
                    <ul className="mt-1 space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                      {debate.round2Critic.counterProposals.map((cp) => (
                        <li key={cp}>→ {cp}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          </div>

          <div className="rounded-xl border border-teal-200/80 bg-teal-50/30 p-4 dark:border-teal-900/50 dark:bg-teal-950/20">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <ShieldCheck
                size={15}
                className="text-teal-700 dark:text-teal-300"
              />
              {t.councilRound3Title}
            </h3>
            <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300">
              {debate.round3Synthesis.summaryForHuman}
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {debate.round3Synthesis.options.map((opt) => {
                const isSelected = selectedOptionId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedOptionId(opt.id)}
                    className={`flex flex-col rounded-xl border p-3.5 text-left transition ${
                      isSelected
                        ? "border-teal-600 bg-white ring-2 ring-teal-600/20 dark:border-teal-400 dark:bg-[#172123]"
                        : "border-slate-200 bg-white/80 hover:border-slate-300 dark:border-slate-800 dark:bg-[#172123]/70"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {opt.id === "safe" ? (
                          <ShieldCheck
                            size={14}
                            className="text-emerald-700 dark:text-emerald-300"
                          />
                        ) : (
                          <TrendingUp
                            size={14}
                            className="text-amber-700 dark:text-amber-300"
                          />
                        )}
                        {opt.title}
                      </span>
                      {isSelected && (
                        <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {t.councilSelectOption}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      {opt.summary}
                    </p>
                    {opt.priceAdjustments.length > 0 && (
                      <div className="mt-2.5 w-full space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {t.councilPriceChangesLabel}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {opt.priceAdjustments.map((adj) => (
                            <span
                              key={adj.serviceKey}
                              className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {adj.label}:{" "}
                              {formatPrice(adj.currentPricePln, locale)} →{" "}
                              <b>{formatPrice(adj.finalPricePln, locale)}</b>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <ul className="mt-2.5 space-y-1 text-[10px] text-slate-600 dark:text-slate-400">
                      {opt.actionItems.map((task) => (
                        <li key={task}>✓ {task}</li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleApproveAndPublish}
                disabled={isPublishing}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60"
              >
                <CheckCircle2 size={15} />
                {isPublishing
                  ? t.councilPublishingBtn
                  : t.councilApprovePublishBtn}
              </button>

              {(publishedConfluence || publishedJira) && (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="font-medium text-emerald-800 dark:text-emerald-300">
                    {t.councilPublishedOk}
                  </span>
                  {confluenceHref ? (
                    <a
                      href={confluenceHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-teal-700 underline dark:text-teal-300"
                    >
                      {t.councilOpenConfluence}
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    publishedConfluence && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {publishedConfluence.pageTitle}
                      </span>
                    )
                  )}
                  {jiraHref ? (
                    <a
                      href={jiraHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-teal-700 underline dark:text-teal-300"
                    >
                      {publishedJira?.epicKey || t.councilOpenJira}
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    publishedJira && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {publishedJira.epicKey}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
