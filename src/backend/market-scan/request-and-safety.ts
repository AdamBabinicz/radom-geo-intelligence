import { INDUSTRY_TEMPLATES, type IndustryId } from "@/src/config/industries";
import type {
  ActiveServiceDescriptor,
  GroundingSource,
  ScanRequestParams,
  SiteProfileParam,
} from "./types";

const AGGREGATOR_HOSTS = [
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "linkedin.com",
  "olx.pl",
  "allegro.pl",
  "allegrolokalnie.pl",
  "fixly.pl",
  "oferteo.pl",
  "panoramafirm.pl",
  "pkt.pl",
  "aleo.com",
  "gowork.pl",
  "cylex-polska.pl",
  "favore.pl",
  "dobryfachowiec.pl",
  "znanyfachowiec.pl",
  "kb.pl",
  "cennik-uslug.pl",
  "extradom.pl",
  "muratordom.pl",
  "firmy.net",
  "baza-firm.com.pl",
  "targeo.pl",
  "zumi.pl",
  "pf.pl",
  "pomocedomowe.pl",
  "sprzatanko.pl",
  "weselezklasa.pl",
  "gdziewesele.pl",
  "planujemywesele.pl",
  "slubnaglowie.pl",
  "oprawa.pl",
  "evently.pl",
  "booksy.com",
  "fresha.com",
  "yelp.com",
  "tripadvisor.com",
  "angi.com",
  "homeadvisor.com",
  "thumbtack.com",
  "bbb.org",
  "yellowpages.com",
  "houzz.com",
  "expertise.com",
  "nextdoor.com",
  "porch.com",
  "bark.com",
  "checkatrade.com",
  "mybuilder.com",
  "trustpilot.com",
  "mapquest.com",
  "superpages.com",
  "manta.com",
  "birdeye.com",
  "chamberofcommerce.com",
  "threebestrated.com",
  "wikipedia.org",
  "duckduckgo.com",
  "google.com",
  "bing.com",
];

export const CURRENCY_LINE_RE =
  /(?:\d\s*(?:z[łl]|pln|eur|usd|gbp|chf|cad|aud|\$|€|£|,-)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])|(?:€|\$|£|pln|eur|usd|gbp|chf|cad|aud)\s*\d)/i;

export const ZERO_PRICE_ONLY_RE =
  /^\s*(?:0+(?:[.,]0+)?\s*(?:z[łl]|pln|eur|usd|gbp|chf|cad|aud|\$|€|£)|(?:€|\$|£)\s*0+(?:[.,]0+)?)\s*$/i;

const BOT_BLOCK_RE =
  /(bot verification|just a moment|attention required|verify you are human|access denied|checking your browser|enable javascript and cookies|security check|captcha)/i;

export function isBotChallengePage(
  title: string,
  visibleText: string,
): boolean {
  if (BOT_BLOCK_RE.test(title)) return true;
  return visibleText.length < 1_000 && BOT_BLOCK_RE.test(visibleText);
}

function resolveIndustryId(raw: unknown): IndustryId {
  if (typeof raw === "string" && raw in INDUSTRY_TEMPLATES) {
    return raw as IndustryId;
  }
  return "upholstery";
}

export function isSafePublicUrl(rawUrl: string): URL | null {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return null;
    }
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
      return null;
    }
    if (/^169\.254\./.test(host)) {
      return null;
    }
    const match172 = host.match(/^172\.(\d+)\./);
    if (match172) {
      const secondOctet = Number(match172[1]);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function getNormalizedHostFromUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const parsed = isSafePublicUrl(rawUrl);
  return parsed ? normalizeHost(parsed.hostname) : null;
}

export function isAggregatorHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return AGGREGATOR_HOSTS.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`),
  );
}

export function isExcludedCompetitorWebsite(
  rawUrl: string | undefined,
  excludeHost?: string,
): boolean {
  if (!rawUrl || !excludeHost) return false;
  const host = getNormalizedHostFromUrl(rawUrl);
  return host === excludeHost;
}

export function deduplicateSources(
  sources: GroundingSource[],
  limit = 15,
): GroundingSource[] {
  const seen = new Map<string, GroundingSource>();
  for (const src of sources) {
    const uri = src.uri?.trim();
    if (!uri) continue;
    if (!seen.has(uri)) {
      seen.set(uri, { title: src.title?.trim() || uri, uri });
    }
    if (seen.size >= limit) break;
  }
  return Array.from(seen.values());
}

function parseServicesParam(raw: unknown): ActiveServiceDescriptor[] {
  if (!Array.isArray(raw)) return [];
  const parsed: ActiveServiceDescriptor[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const serviceKey =
      typeof obj.serviceKey === "string" ? obj.serviceKey.trim() : "";
    if (!serviceKey || seen.has(serviceKey)) continue;
    seen.add(serviceKey);
    parsed.push({
      serviceKey,
      label:
        typeof obj.label === "string"
          ? obj.label.trim().slice(0, 90)
          : undefined,
      unitType:
        typeof obj.unitType === "string"
          ? obj.unitType.trim().slice(0, 16)
          : undefined,
      ourPricePln:
        typeof obj.ourPricePln === "number" &&
        Number.isFinite(obj.ourPricePln) &&
        obj.ourPricePln > 0
          ? Math.round(obj.ourPricePln)
          : undefined,
    });
    if (parsed.length >= 25) break;
  }
  return parsed;
}

function parseSiteProfileParam(raw: unknown): SiteProfileParam | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const normalizeList = (val: unknown): string[] =>
    Array.isArray(val)
      ? val
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length >= 3 && item.length <= 90)
          .slice(0, 4)
      : [];

  const nichePl =
    typeof obj.nichePl === "string" ? obj.nichePl.trim().slice(0, 100) : "";
  const nicheEn =
    typeof obj.nicheEn === "string" ? obj.nicheEn.trim().slice(0, 100) : "";
  const businessName =
    typeof obj.businessName === "string"
      ? obj.businessName.trim().slice(0, 80)
      : undefined;
  const matchedIndustryId =
    typeof obj.matchedIndustryId === "string"
      ? obj.matchedIndustryId.trim().toLowerCase()
      : undefined;
  const searchQueriesPl = normalizeList(obj.searchQueriesPl);
  const searchQueriesEn = normalizeList(obj.searchQueriesEn);

  if (
    !nichePl &&
    !nicheEn &&
    searchQueriesPl.length === 0 &&
    searchQueriesEn.length === 0
  ) {
    return undefined;
  }

  return {
    businessName,
    nichePl: nichePl || nicheEn,
    nicheEn: nicheEn || nichePl,
    matchedIndustryId,
    searchQueriesPl,
    searchQueriesEn,
  };
}

export function parseScanParams(
  input: Record<string, unknown>,
): ScanRequestParams {
  const rawCity = typeof input.city === "string" ? input.city.trim() : "";
  const city = rawCity.slice(0, 100) || "Radom";
  const rawCountry =
    typeof input.country === "string" ? input.country.trim() : "";
  const country = rawCountry.slice(0, 80) || "Poland";
  const rawCountryCode =
    typeof input.countryCode === "string"
      ? input.countryCode.trim().toLowerCase()
      : "";
  const countryCode = /^[a-z]{2}$/.test(rawCountryCode)
    ? rawCountryCode
    : undefined;
  const industryId = resolveIndustryId(input.industry ?? input.industryId);
  const parsedRadius = Number(input.radiusKm);
  const radiusKm = Number.isFinite(parsedRadius)
    ? Math.min(100, Math.max(5, Math.round(parsedRadius)))
    : 30;
  const locale = input.locale === "en" ? "en" : "pl";

  const rawUrls: string[] = [];
  if (Array.isArray(input.competitorUrls)) {
    for (const item of input.competitorUrls) {
      if (typeof item === "string") rawUrls.push(item);
    }
  } else if (typeof input.urls === "string") {
    for (const part of input.urls.split(",")) {
      rawUrls.push(part);
    }
  }

  const competitorUrls = Array.from(
    new Set(
      rawUrls
        .map((u) => isSafePublicUrl(u)?.toString() ?? "")
        .filter((u) => u.length > 0),
    ),
  ).slice(0, 10);

  const excludeRaw =
    typeof input.excludeUrl === "string" ? input.excludeUrl.trim() : "";
  const excludeParsed = isSafePublicUrl(excludeRaw);
  const excludeHost = excludeParsed
    ? normalizeHost(excludeParsed.hostname)
    : undefined;

  return {
    city,
    country,
    countryCode,
    industryId,
    radiusKm,
    locale,
    competitorUrls,
    excludeHost,
    services: parseServicesParam(input.services),
    siteProfile: parseSiteProfileParam(input.siteProfile),
  };
}

export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("UNAVAILABLE") ||
    msg.toLowerCase().includes("quota")
  );
}

export function extractGroundingSources(
  chunks: Array<{ web?: { uri?: string; title?: string } }> | undefined,
): GroundingSource[] {
  if (!Array.isArray(chunks)) return [];
  const raw: GroundingSource[] = [];
  for (const chunk of chunks) {
    const uri = chunk.web?.uri?.trim();
    if (!uri) continue;
    raw.push({
      uri,
      title: chunk.web?.title?.trim() || uri,
    });
  }
  return deduplicateSources(raw, 15);
}
