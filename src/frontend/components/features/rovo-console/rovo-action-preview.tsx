"use client";

import { ExternalLink, FileText, Layers, X } from "lucide-react";
import type { AppDictionary } from "@/src/locales";
import type {
  ConfluenceExportResult,
  JiraEpicResult,
} from "@/src/types/market";

interface RovoActionPreviewProps {
  t: AppDictionary;
  confluenceResult: ConfluenceExportResult | null;
  jiraResult: JiraEpicResult | null;
  onClose: () => void;
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

export function RovoActionPreview({
  t,
  confluenceResult,
  jiraResult,
  onClose,
}: RovoActionPreviewProps) {
  if (!confluenceResult && !jiraResult) return null;

  const isPl = t.confluenceDraftBadge.toUpperCase().includes("SZKIC");
  const isLiveConfluence = confluenceResult?.status === "published";
  const isLiveJira = jiraResult?.status === "created";
  const isLive = isLiveConfluence || isLiveJira;

  const confluenceHref = toSafeHttpUrl(confluenceResult?.pageUrl);
  const jiraEpicHref = toSafeHttpUrl(jiraResult?.epicUrl);

  return (
    <div
      className={
        isLive
          ? "mx-5 mt-3 rounded-lg border border-emerald-200/90 bg-emerald-50/50 p-3 text-[11px] dark:border-emerald-900/60 dark:bg-emerald-950/30"
          : "mx-5 mt-3 rounded-lg border border-blue-200/80 bg-blue-50/50 p-3 text-[11px] dark:border-blue-900/60 dark:bg-blue-950/30"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={
            isLive
              ? "flex min-w-0 items-center gap-1.5 font-semibold text-emerald-900 dark:text-emerald-200"
              : "flex min-w-0 items-center gap-1.5 font-semibold text-blue-900 dark:text-blue-200"
          }
        >
          {confluenceResult ? (
            <FileText size={13} className="shrink-0" />
          ) : (
            <Layers size={13} className="shrink-0" />
          )}
          <span
            className={
              isLive
                ? "shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200"
                : "shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-blue-800 dark:bg-blue-900/70 dark:text-blue-200"
            }
          >
            {confluenceResult
              ? isLiveConfluence
                ? isPl
                  ? "OPUBLIKOWANO · CONFLUENCE"
                  : "PUBLISHED · CONFLUENCE"
                : t.confluenceDraftBadge
              : isLiveJira
                ? isPl
                  ? "UTWORZONO · JIRA"
                  : "CREATED · JIRA"
                : t.jiraEpicBadge}
          </span>
          <span className="truncate">
            {confluenceResult
              ? confluenceResult.pageTitle
              : `${jiraResult?.epicKey} · ${jiraResult?.epicTitle}`}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.clearSelection}
          className="rounded p-0.5 text-slate-400 hover:bg-white/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X size={13} />
        </button>
      </div>

      {confluenceResult && (
        <div className="mt-1.5 space-y-1.5 text-[10px] text-slate-600 dark:text-slate-300">
          <p>{confluenceResult.summary}</p>
          <p className="text-slate-500 dark:text-slate-400">
            {t.targetTownsLabel}: {confluenceResult.targetTowns.join(", ")}
          </p>
          {confluenceHref && (
            <a
              href={confluenceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              {isPl
                ? `Otwórz stronę w Confluence (${confluenceResult.spaceKey})`
                : `Open page in Confluence (${confluenceResult.spaceKey})`}
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {jiraResult && (
        <div className="mt-2 space-y-1.5">
          {jiraEpicHref && (
            <a
              href={jiraEpicHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              {isPl
                ? `Otwórz ${jiraResult.epicKey} w Jira (${jiraResult.projectKey})`
                : `Open ${jiraResult.epicKey} in Jira (${jiraResult.projectKey})`}
              <ExternalLink size={11} />
            </a>
          )}
          <ul className="space-y-1 text-[10px] text-slate-600 dark:text-slate-300">
            {jiraResult.subtasks.map((task) => {
              const taskHref = toSafeHttpUrl(task.url);
              return (
                <li
                  key={task.key}
                  className="flex items-center gap-2 font-mono"
                >
                  {taskHref ? (
                    <a
                      href={taskHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-300"
                    >
                      {task.key}
                      <ExternalLink size={9} />
                    </a>
                  ) : (
                    <span className="shrink-0 font-semibold text-blue-700 dark:text-blue-300">
                      {task.key}
                    </span>
                  )}
                  <span className="font-sans">{task.summary}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
