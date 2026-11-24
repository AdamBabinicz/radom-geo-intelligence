"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Bot,
  Check,
  Circle,
  Clock3,
  FileText,
  Layers,
  Play,
  Sparkles,
} from "lucide-react";
import { resolveServiceLabel, type IndustryId } from "@/src/config/industries";
import { getMarketMetrics, type MarketProfile } from "@/src/config/markets";
import type { McpAnalysisSummary } from "@/src/frontend/components/dashboard/types-and-helpers";
import { formatTemplate, type AppDictionary, type Locale } from "@/src/locales";
import type {
  ConfluenceExportResult,
  JiraEpicResult,
} from "@/src/types/market";
import { RovoActionPreview } from "./rovo-action-preview";

const MCP_REQUEST_TIMEOUT_MS = 30_000;

interface RovoConsoleProps {
  t: AppDictionary;
  market: MarketProfile;
  locale: Locale;
  radiusKm: number;
  running: boolean;
  onRun: () => void;
  industryId?: IndustryId;
  liveCompetitorsCount?: number;
  detectedIndustryLabel?: string;
  topPainPoint?: string;
  mcpSummary?: McpAnalysisSummary | null;
  mcpError?: string | null;
}

interface McpJsonRpcPayload<T> {
  result?: {
    structuredContent?: T;
  };
  error?: {
    code?: number;
    message?: string;
  };
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

async function invokeMcpTool<T>(
  name: string,
  args: Record<string, unknown>,
  t: AppDictionary,
): Promise<T> {
  const response = await fetch("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(MCP_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const payload = await readJsonSafe<McpJsonRpcPayload<T>>(response);
  if (!response.ok) {
    if (isTimeoutFailure(null, response.status)) {
      throw new Error(t.mcpTimeoutError);
    }
    throw new Error(
      payload?.error?.message ??
        formatTemplate(t.mcpHttpError, { status: response.status }),
    );
  }
  if (payload?.error?.message) {
    throw new Error(payload.error.message);
  }
  if (!payload?.result?.structuredContent) {
    throw new Error(t.mcpEmptyError);
  }
  return payload.result.structuredContent;
}

export function RovoConsole({
  t,
  market,
  locale,
  radiusKm,
  running,
  onRun,
  industryId = "upholstery",
  liveCompetitorsCount,
  detectedIndustryLabel,
  topPainPoint,
  mcpSummary = null,
  mcpError = null,
}: RovoConsoleProps) {
  const [busyAction, setBusyAction] = useState<"confluence" | "jira" | null>(
    null,
  );
  const [confluenceResult, setConfluenceResult] =
    useState<ConfluenceExportResult | null>(null);
  const [jiraResult, setJiraResult] = useState<JiraEpicResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setConfluenceResult(null);
    setJiraResult(null);
    setActionError(null);
  }, [market.id, radiusKm, industryId, detectedIndustryLabel]);

  const metrics = getMarketMetrics(market, radiusKm);
  const effectiveCompetitorsCount =
    mcpSummary && mcpSummary.competitorsTracked > 0
      ? mcpSummary.competitorsTracked
      : typeof liveCompetitorsCount === "number" && liveCompetitorsCount > 0
        ? liveCompetitorsCount
        : metrics.competitorsTracked;

  const effectiveTownsCount =
    mcpSummary && mcpSummary.serviceableTownsCount > 0
      ? mcpSummary.serviceableTownsCount
      : metrics.serviceableTownsCount;

  const completedTimeLabel = mcpSummary
    ? new Date(mcpSummary.completedAtIso).toLocaleTimeString(
        locale === "pl" ? "pl-PL" : "en-US",
        { hour: "2-digit", minute: "2-digit", second: "2-digit" },
      )
    : null;

  const visibleError = actionError ?? mcpError;

  const townsInRadius = [
    market.centerName,
    ...metrics.localTowns
      .filter((town) => town.distKm <= radiusKm)
      .map((town) => town.name),
  ];

  const handleConfluenceExport = async () => {
    setBusyAction("confluence");
    setActionError(null);
    try {
      const data = await invokeMcpTool<ConfluenceExportResult>(
        "exportStrategyToConfluence",
        {
          center: market.centerName,
          radiusKm,
          season: "Q4",
          industryId,
          townsInRadius,
          competitorsTracked: effectiveCompetitorsCount,
          ...(detectedIndustryLabel ? { detectedIndustryLabel } : {}),
          ...(topPainPoint ? { topPainPoint } : {}),
          benchmarks: market.benchmarks.map((b) => ({
            serviceKey: b.serviceKey,
            serviceLabel: resolveServiceLabel(b, t, locale),
            ourPricePln: b.ourPricePln,
            localPricePln: b.localPricePln,
          })),
          locale,
        },
        t,
      );
      setJiraResult(null);
      setConfluenceResult(data);
    } catch (error) {
      setActionError(
        isTimeoutFailure(error)
          ? t.mcpTimeoutError
          : error instanceof Error && error.message.trim()
            ? error.message
            : t.confluenceExportError,
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateJiraEpics = async () => {
    setBusyAction("jira");
    setActionError(null);
    try {
      const data = await invokeMcpTool<JiraEpicResult>(
        "createJiraMarketingEpics",
        {
          center: market.centerName,
          radiusKm,
          industryId,
          townsInRadius,
          competitorsTracked: effectiveCompetitorsCount,
          locale,
        },
        t,
      );
      setConfluenceResult(null);
      setJiraResult(data);
    } catch (error) {
      setActionError(
        isTimeoutFailure(error)
          ? t.mcpTimeoutError
          : error instanceof Error && error.message.trim()
            ? error.message
            : t.jiraCreateError,
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section
      id="agent"
      className="rounded-xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#172123]"
    >
      <div className="flex items-center justify-between p-5 pb-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Bot size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{t.agentTitle}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {t.agentConnected}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-violet-200 bg-violet-50/50 px-2.5 py-1 text-[9px] font-semibold text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">
          {t.rovoAgentLabel}
        </span>
      </div>

      <div className="mx-5 rounded-lg border border-slate-200/80 bg-slate-50 p-4 font-mono text-[11px] text-slate-700 dark:border-white/10 dark:bg-[#111a1c] dark:text-slate-300">
        <div className="mb-3 flex items-center justify-between border-b border-slate-200/80 pb-2 text-[9px] text-slate-500 dark:border-white/10 dark:text-slate-400">
          <span className="font-semibold tracking-wider">{t.executionLog}</span>
          <span className="flex items-center gap-1">
            <Clock3 size={10} />
            {running ? t.running : (completedTimeLabel ?? t.completedAt)}
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          <LogLine
            icon={<Check size={12} />}
            text={`${t.logConnectedPrefix} ${market.centerName} (${radiusKm} ${t.kmUnit})`}
            status="done"
          />
          <LogLine
            icon={<Check size={12} />}
            text={`${t.logCompetitorsPrefix} ${effectiveCompetitorsCount} ${t.logCompetitorsSuffix}`}
            status="done"
          />
          <LogLine
            icon={
              running ? (
                <Circle size={11} className="animate-pulse" />
              ) : (
                <Check size={12} />
              )
            }
            text={`${t.logPricingPrefix} ${effectiveTownsCount} ${t.logPricingSuffix}`}
            status={running ? "active" : "done"}
          />
          <LogLine
            icon={running ? <Circle size={11} /> : <Check size={12} />}
            text={t.logConfluence}
            status={running ? "pending" : "done"}
          />
        </div>

        <div className="mt-3 border-t border-slate-200/80 pt-2.5 text-[10px] font-medium text-emerald-700 dark:border-white/10 dark:text-emerald-300">
          <span className="text-slate-400 dark:text-slate-500">{"> "}</span>
          {running
            ? t.agentWorking
            : mcpSummary
              ? `${t.runSuccessful} · ${mcpSummary.center} (${mcpSummary.radiusKm} ${t.kmUnit}, ${mcpSummary.serviceableTownsCount} ${t.logPricingSuffix}, ${mcpSummary.competitorsTracked} ${t.logCompetitorsSuffix})`
              : t.runSuccessful}
        </div>
      </div>

      <RovoActionPreview
        t={t}
        confluenceResult={confluenceResult}
        jiraResult={jiraResult}
        onClose={() => {
          setConfluenceResult(null);
          setJiraResult(null);
        }}
      />

      {visibleError && (
        <div className="mx-5 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          {visibleError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={handleConfluenceExport}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <FileText size={13} className="text-blue-600 dark:text-blue-400" />
          {busyAction === "confluence"
            ? t.exportingConfluence
            : t.exportConfluence}
        </button>
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={handleCreateJiraEpics}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Layers size={13} className="text-indigo-600 dark:text-indigo-400" />
          {busyAction === "jira" ? t.creatingJiraEpics : t.createJiraEpics}
        </button>
      </div>

      <div className="flex flex-col gap-3 p-5 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[280px] text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
          {t.agentDescription}
        </p>
        <button
          type="button"
          disabled={running}
          onClick={onRun}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-700 px-3.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-700 dark:hover:bg-teal-600"
        >
          <Play size={12} fill="currentColor" />
          {running ? t.running : t.runScanShort}
          <Sparkles size={12} />
        </button>
      </div>
    </section>
  );
}

function LogLine({
  icon,
  text,
  status,
}: {
  icon: ReactNode;
  text: string;
  status: "done" | "active" | "pending";
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          status === "done"
            ? "text-emerald-600 dark:text-emerald-400"
            : status === "active"
              ? "text-amber-600 dark:text-amber-300"
              : "text-slate-400 dark:text-slate-600"
        }
      >
        {icon}
      </span>
      <span
        className={
          status === "pending" ? "text-slate-400 dark:text-slate-500" : ""
        }
      >
        {text}
      </span>
    </div>
  );
}
