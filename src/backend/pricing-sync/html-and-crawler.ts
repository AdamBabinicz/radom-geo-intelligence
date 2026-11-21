import { FETCH_HTML_TIMEOUT_MS, type HtmlMetadata } from "./types";

const BOT_CHALLENGE_RE =
  /(bot verification|just a moment|attention required|verify you are human|access denied|checking your browser|enable javascript and cookies|security check|captcha)/i;

const VENDOR_SCRIPT_RE =
  /^(?:react|react-dom|radix|lucide|icons|motion|framer-motion|query|tanstack|vendor|polyfill|chunk-vendors)/i;
const APP_OR_PRICING_SCRIPT_RE =
  /(?:index|main|app|oferta|offer|cennik|price|pricing|calc|service|uslug|menu|wynajem|catalog|atrakcj|shop|store|produkt)/i;
const IGNORE_LAZY_CHUNK_RE =
  /^(?:react|react-dom|radix|lucide|icons|motion|framer-motion|query|tanstack|vendor|polyfill|privacy|polityk|regulamin|terms|rodo|cookie|404|error|gallery|galeria|about|o-firmie|realizacje|sprzet|contactform|footer|header)/i;

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
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

export function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/(&sup2;|&#178;)/gi, "²")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function htmlToCleanText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|li|tr|td|th|h[1-6]|section|article|option)>/gi, " \n ")
    .replace(/<br\s*\/?>/gi, " \n ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/(&sup2;|&#178;)/gi, "²")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function isBotChallengeHtml(html: string): boolean {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeHtmlEntities(titleMatch?.[1] ?? "");
  if (BOT_CHALLENGE_RE.test(title)) return true;
  const visible = htmlToCleanText(html);
  return visible.length < 900 && BOT_CHALLENGE_RE.test(visible);
}

export function extractHtmlMetadata(html: string): HtmlMetadata {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeHtmlEntities(titleMatch?.[1] ?? "").slice(0, 140);
  const descMatch =
    html.match(
      /<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["']/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']description["']/i,
    );
  const description = decodeHtmlEntities(descMatch?.[1] ?? "").slice(0, 260);
  const headings: string[] = [];
  const headingRe = /<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi;
  for (const match of html.matchAll(headingRe)) {
    const cleaned = decodeHtmlEntities(match[1] ?? "");
    if (
      cleaned.length >= 3 &&
      cleaned.length <= 120 &&
      !headings.includes(cleaned)
    ) {
      headings.push(cleaned);
    }
    if (headings.length >= 3) break;
  }
  return { title, description, headings };
}

export function findPricingSubpages(html: string, baseUrl: URL): string[] {
  const candidates = new Set<string>();
  const linkRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const hintRe =
    /(cennik|pricing|oferta|ceny|us[łl]ug|services|rates|wynajem|atrakcj)/i;
  for (const match of html.matchAll(linkRe)) {
    const href = match[1].trim();
    const label = match[2].replace(/<[^>]+>/g, " ").trim();
    if (!hintRe.test(href) && !hintRe.test(label)) continue;
    if (/\.(pdf|jpg|jpeg|png|webp|svg|avif)$/i.test(href)) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.origin !== baseUrl.origin) continue;
      if (resolved.pathname === baseUrl.pathname) continue;
      candidates.add(resolved.toString());
    } catch {
      continue;
    }
  }
  return Array.from(candidates).slice(0, 3);
}

export function findSameOriginScripts(html: string, baseUrl: URL): string[] {
  const scripts = new Map<string, number>();
  const assetPatterns = [
    /<script[^>]+src=["']([^"']+)["']/gi,
    /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']modulepreload["']/gi,
  ];

  for (const pattern of assetPatterns) {
    for (const match of html.matchAll(pattern)) {
      try {
        const resolved = new URL(match[1].trim(), baseUrl);
        if (resolved.origin !== baseUrl.origin) continue;
        if (!resolved.pathname.endsWith(".js")) continue;
        const fileName = resolved.pathname.split("/").pop() ?? "";
        if (VENDOR_SCRIPT_RE.test(fileName)) continue;
        const score = APP_OR_PRICING_SCRIPT_RE.test(fileName) ? 10 : 1;
        const urlStr = resolved.toString();
        if (!scripts.has(urlStr) || (scripts.get(urlStr) ?? 0) < score) {
          scripts.set(urlStr, score);
        }
      } catch {
        continue;
      }
    }
  }

  return Array.from(scripts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, 5);
}

export function findLazyRouteChunks(
  fetchedScripts: Array<{ url: string; text: string }>,
  baseUrl: URL,
): string[] {
  const alreadyFetched = new Set(fetchedScripts.map((s) => s.url));
  const pathSegments = baseUrl.pathname
    .toLowerCase()
    .split("/")
    .filter((seg) => seg.length >= 3);
  const candidates = new Map<string, number>();

  const assetPathRe =
    /["']((?:\.\.?\/|\/)?(?:assets|_next\/static\/chunks|static\/js)\/[a-zA-Z0-9_./-]+\.js)["']/g;
  const dynamicImportRe =
    /import\(\s*["'](\.\.?\/[a-zA-Z0-9_./-]+\.js)["']\s*\)/g;

  for (const script of fetchedScripts) {
    const parentUrl = new URL(script.url);
    const registerCandidate = (rawPath: string, resolveFromScript: boolean) => {
      try {
        const resolved = new URL(
          rawPath.startsWith("assets/") ||
            rawPath.startsWith("_next/") ||
            rawPath.startsWith("static/")
            ? `/${rawPath}`
            : rawPath,
          resolveFromScript ? parentUrl : baseUrl,
        );
        if (resolved.origin !== baseUrl.origin) return;
        if (!resolved.pathname.endsWith(".js")) return;
        const urlStr = resolved.toString();
        if (alreadyFetched.has(urlStr)) return;

        const fileName = (
          resolved.pathname.split("/").pop() ?? ""
        ).toLowerCase();
        if (IGNORE_LAZY_CHUNK_RE.test(fileName)) return;

        let score = 0;
        if (pathSegments.some((seg) => fileName.includes(seg))) {
          score += 100;
        }
        if (APP_OR_PRICING_SCRIPT_RE.test(fileName)) {
          score += 50;
        }
        if (score > 0 && (candidates.get(urlStr) ?? 0) < score) {
          candidates.set(urlStr, score);
        }
      } catch {
        // ignore invalid chunk path
      }
    };

    for (const m of script.text.matchAll(assetPathRe)) {
      registerCandidate(m[1], m[1].startsWith("."));
    }
    for (const m of script.text.matchAll(dynamicImportRe)) {
      registerCandidate(m[1], true);
    }
  }

  return Array.from(candidates.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, 4);
}

export async function fetchTextSafe(
  targetUrl: string,
  timeoutMs = FETCH_HTML_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "NorthstarOps-PriceSync/3.1 (+https://northstar-ops.app)",
        Accept: "text/html,application/xhtml+xml,application/javascript,*/*",
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}
