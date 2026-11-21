import {
  INDUSTRY_TEMPLATES,
  resolveUnitType,
  type IndustryId,
  type IndustryServiceItem,
  type ServiceUnitType,
} from "@/src/config/industries";
import {
  RADOM_UPHOLSTERY_MARKET,
  type MarketProfile,
} from "@/src/config/markets";
import {
  formatTemplate,
  SUPPORTED_LOCALES,
  type AppDictionary,
  type Locale,
} from "@/src/locales";
import type { LiveMarketScanResult } from "../features/competitor-table/competitor-table";

export const LOCALE_KEY = "northstar_locale";
export const THEME_KEY = "northstar_theme";
export const DEFAULT_WEBSITE_URL = "https://pranie-dywanow.j.pl/";
export const CLIENT_SYNC_TIMEOUT_MS = 55_000;

export const LEGAL_ROUTE_OVERRIDES: Partial<
  Record<Locale, { privacy: string; terms: string }>
> = {
  pl: {
    privacy: "/polityka-prywatnosci",
    terms: "/regulamin",
  },
};

export type PricingSyncCode =
  | "MISSING_URL"
  | "INVALID_URL"
  | "INVALID_PROTOCOL"
  | "PRIVATE_HOST_BLOCKED"
  | "SITE_UNREACHABLE"
  | "NO_PUBLIC_PRICES"
  | "AI_FALLBACK_USED";

export interface PricingSyncItem {
  serviceKey: string;
  pricePln: number;
  labelPl?: string;
  labelEn?: string;
  unitType?: ServiceUnitType;
}

export interface SiteProfile {
  businessName?: string;
  nichePl: string;
  nicheEn: string;
  matchedIndustryId?: "upholstery" | "hvac" | "plumbing" | "custom";
  searchQueriesPl?: string[];
  searchQueriesEn?: string[];
}

export interface PricingSyncResponse {
  aiEnhanced?: boolean;
  hasPublicPrices?: boolean;
  code?: PricingSyncCode;
  host?: string;
  warning?: string;
  extractedCount?: number;
  siteProfile?: SiteProfile;
  prices?: PricingSyncItem[];
  error?: string;
}

export type LiveScanWithNiche = LiveMarketScanResult & {
  detectedIndustryLabel?: string;
};

export interface WorkspaceProfile {
  initials: string;
  displayName: string;
  isDomainBound: boolean;
}

export function isSupportedLocale(value: string | null): value is Locale {
  if (!value) return false;
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isPresetIndustryId(
  value: string | undefined,
): value is "upholstery" | "hvac" | "plumbing" {
  return value === "upholstery" || value === "hvac" || value === "plumbing";
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

export function isTimeoutFailure(err: unknown, status?: number): boolean {
  if (status === 408 || status === 504) return true;
  if (err instanceof DOMException) {
    return err.name === "TimeoutError" || err.name === "AbortError";
  }
  return false;
}

export function isBlockedLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }
  if (/^169\.254\./.test(host)) return true;
  const match172 = host.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function validateClientWebsiteUrl(
  rawUrl: string,
  t: AppDictionary,
): { valid: true; host: string } | { valid: false; message: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return { valid: false, message: t.syncInvalidUrlError };
  }

  let parsed: URL;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    parsed = new URL(withProtocol);
  } catch {
    return { valid: false, message: t.syncInvalidUrlError };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, message: t.syncInvalidUrlError };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (isBlockedLocalHostname(host)) {
    return { valid: false, message: t.syncPrivateHostError };
  }

  if (
    !host ||
    !host.includes(".") ||
    host.startsWith(".") ||
    host.endsWith(".") ||
    host.includes("..")
  ) {
    return { valid: false, message: t.syncInvalidUrlError };
  }

  return { valid: true, host };
}

export function resolveSyncErrorMessage(
  data: PricingSyncResponse | null,
  status: number,
  fallbackHost: string,
  t: AppDictionary,
): string {
  const targetHost = data?.host || fallbackHost;
  switch (data?.code) {
    case "MISSING_URL":
    case "INVALID_URL":
    case "INVALID_PROTOCOL":
      return t.syncInvalidUrlError;
    case "PRIVATE_HOST_BLOCKED":
      return t.syncPrivateHostError;
    case "SITE_UNREACHABLE":
      return formatTemplate(t.syncSiteUnreachableError, { host: targetHost });
    default:
      break;
  }
  if (!data) {
    return isTimeoutFailure(null, status)
      ? t.syncWebsiteTimeoutError
      : formatTemplate(t.syncWebsiteHttpError, { status });
  }
  return data.error ?? data.warning ?? t.syncWebsiteError;
}

export function resolveWorkspaceProfile(
  websiteUrl: string,
  defaultName: string,
): WorkspaceProfile {
  const raw = websiteUrl.trim();
  if (!raw) {
    return {
      initials: "NO",
      displayName: defaultName,
      isDomainBound: false,
    };
  }
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProtocol).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    if (!host || !host.includes(".")) {
      return {
        initials: "NO",
        displayName: defaultName,
        isDomainBound: false,
      };
    }
    const primaryLabel = host.split(".")[0] ?? host;
    const parts = primaryLabel.split(/[-_]+/).filter(Boolean);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : primaryLabel.slice(0, 2).toUpperCase();
    return {
      initials: initials || "NO",
      displayName: host,
      isDomainBound: true,
    };
  } catch {
    return {
      initials: "NO",
      displayName: defaultName,
      isDomainBound: false,
    };
  }
}

export function buildSyncedCatalog(
  prices: PricingSyncItem[],
  effectiveIndustryId: IndustryId,
  baseMarket: MarketProfile,
): IndustryServiceItem[] {
  const effectiveBaselineByKey = new Map(
    INDUSTRY_TEMPLATES[effectiveIndustryId].services.map((row) => [
      row.serviceKey,
      row,
    ]),
  );
  const canUseCaseStudyBaseline =
    baseMarket.id === RADOM_UPHOLSTERY_MARKET.id &&
    (baseMarket.source ?? "case-study") === "case-study";

  const nextCatalog: IndustryServiceItem[] = [];
  const seenKeys = new Set<string>();
  for (const item of prices) {
    if (
      typeof item.serviceKey !== "string" ||
      !item.serviceKey.trim() ||
      typeof item.pricePln !== "number" ||
      !Number.isFinite(item.pricePln) ||
      item.pricePln <= 0
    ) {
      continue;
    }
    const key = item.serviceKey.trim();
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const preset = effectiveBaselineByKey.get(key);
    const unitType: ServiceUnitType =
      item.unitType === "m2" ||
      item.unitType === "piece" ||
      item.unitType === "fixed"
        ? item.unitType
        : preset
          ? resolveUnitType(preset)
          : "fixed";

    const presetUnit = preset ? resolveUnitType(preset) : null;
    const isUnitCompatible =
      presetUnit === null || (unitType === "m2") === (presetUnit === "m2");
    const isPriceScaleCompatible =
      !preset ||
      preset.ourPricePln <= 0 ||
      (item.pricePln / preset.ourPricePln >= 0.4 &&
        item.pricePln / preset.ourPricePln <= 2.5);

    nextCatalog.push({
      serviceKey: key,
      ourPricePln: Math.round(item.pricePln),
      localPricePln:
        canUseCaseStudyBaseline &&
        preset &&
        isUnitCompatible &&
        isPriceScaleCompatible
          ? preset.localPricePln
          : 0,
      isPerUnit: unitType !== "fixed",
      unitType,
      labels:
        item.labelPl || item.labelEn
          ? {
              pl: item.labelPl?.trim() || undefined,
              en: item.labelEn?.trim() || undefined,
            }
          : preset?.labels,
      isLiveDiscovered: true,
    });
  }

  return nextCatalog;
}
