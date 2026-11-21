import {
  CURRENCY_LINE_RE,
  ZERO_PRICE_ONLY_RE,
  isBotChallengePage,
  isSafePublicUrl,
} from "./request-and-safety";
import { MAX_GROQ_RESEARCH_CHARS, type FetchedSiteContext } from "./types";

const VENDOR_SCRIPT_RE =
  /^(?:react|react-dom|radix|lucide|icons|motion|framer-motion|query|tanstack|vendor|polyfill|chunk-vendors|gtag|gtm|analytics|swiper|jquery|bootstrap|cookie|front\.min|comment-reply)/i;

const APP_OR_PRICING_SCRIPT_RE =
  /(?:index|main|app|oferta|offer|cennik|price|pricing|calc|service|uslug|menu|wynajem|catalog|atrakcj|shop|store|produkt)/i;

const IGNORE_LAZY_CHUNK_RE =
  /^(?:react|react-dom|radix|lucide|icons|motion|framer-motion|query|tanstack|vendor|polyfill|privacy|polityk|regulamin|terms|rodo|cookie|404|error|gallery|galeria|about|o-firmie|realizacje|sprzet|contactform|footer|header)/i;

function extractVisibleText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim();

  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    // Keep table cells and definition terms on the same line as their price values
    .replace(/<\/(td|th|dt)>/gi, " : ")
    .replace(/<\/(p|div|li|tr|dd|h[1-6]|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/(&ndash;|&#8211;)/gi, "–")
    .replace(/(&mdash;|&#8212;)/gi, "—")
    .replace(/(&sup2;|&#178;)/gi, "²")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  return { title, text: stripped.slice(0, 14_000) };
}

function extractJsonLdPricingText(html: string): string {
  const lines: string[] = [];
  const scriptRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const obj = node as Record<string, unknown>;
    const name =
      typeof obj.name === "string"
        ? obj.name.trim()
        : typeof obj.description === "string"
          ? obj.description.trim().slice(0, 80)
          : "";
    const priceRaw = obj.price ?? obj.lowPrice;
    const currencyRaw =
      typeof obj.priceCurrency === "string" ? obj.priceCurrency : "PLN";

    if (
      name &&
      priceRaw != null &&
      /^\d+(?:[.,]\d+)?$/.test(String(priceRaw))
    ) {
      lines.push(`SCHEMA_OFFER: ${name} : ${priceRaw} ${currencyRaw}`);
    }
    if (typeof obj.priceRange === "string" && obj.priceRange.trim()) {
      lines.push(`SCHEMA_RANGE: ${name || "Offer"} : ${obj.priceRange.trim()}`);
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") visit(val);
    }
  };

  for (const match of html.matchAll(scriptRe)) {
    const raw = (match[1] ?? "").trim();
    if (!raw || raw.length > 80_000) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      visit(parsed);
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }
  return Array.from(new Set(lines)).slice(0, 30).join("\n");
}

function decodeJsEscapes(raw: string): string {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\u00a0/g, " ");
}

function isJsArtifactLine(line: string): boolean {
  return (
    /\$1|\$2|=>|&&|\{\}|\bfunction\s*\(|\bclassName\b|\bdisplayName\b|\bcreateElement\b|^\s*[,;\]})]/i.test(
      line,
    ) ||
    /^(?:https?:|\/assets\/|\/static\/|#|rgba?\(|M\d|L\d|(?:flex|grid|text|bg|px|py|mx|my|rounded|border|shadow)-)/i.test(
      line,
    )
  );
}

function extractSpaPricingLines(jsTexts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];

  const pushLine = (line: string) => {
    const cleaned = line.replace(/\s+/g, " ").trim();
    if (
      cleaned.length < 5 ||
      cleaned.length > 220 ||
      ZERO_PRICE_ONLY_RE.test(cleaned) ||
      isJsArtifactLine(cleaned) ||
      seen.has(cleaned)
    ) {
      return;
    }
    seen.add(cleaned);
    out.push(cleaned);
  };

  const literalRe = /(?:"((?:[^"\\]|\\.){5,220})"|'((?:[^'\\]|\\.){5,220})')/g;
  const priceKeyRe =
    /(?:price|cost|rate|fee|amount|cena)\s*:\s*["']?(\d{1,5}(?:[.,]\d{1,2})?)["']?/gi;

  for (const js of jsTexts) {
    for (const km of js.matchAll(priceKeyRe)) {
      const idx = km.index ?? 0;
      const left = js.slice(Math.max(0, idx - 220), idx);
      const right = js.slice(idx, Math.min(js.length, idx + 140));

      const nameMatches = Array.from(
        left.matchAll(
          /\b(?:name|title|label|service)\s*:\s*["']([^"']{3,90})["']/g,
        ),
      );
      const label =
        nameMatches.length > 0 ? nameMatches[nameMatches.length - 1][1] : "";
      if (!label) continue;

      const unitMatch =
        right.match(/\b(?:unit|per|period)\s*:\s*["']([^"']{1,24})["']/) ??
        left.match(/\b(?:unit|per|period)\s*:\s*["']([^"']{1,24})["']/);
      const currencyMatch = right.match(
        /\bcurrency\s*:\s*["'](PLN|USD|EUR|GBP|CHF|CAD|AUD|zł|\$|€|£)["']/i,
      );
      const currency = currencyMatch?.[1] ?? "PLN";
      const unitSuffix = unitMatch?.[1] ? ` / ${unitMatch[1]}` : "";
      pushLine(`SPA_ITEM: ${label} : ${km[1]} ${currency}${unitSuffix}`);
    }

    for (const match of js.matchAll(literalRe)) {
      const val = (match[1] ?? match[2] ?? "").trim();
      if (!val || !CURRENCY_LINE_RE.test(val)) continue;
      pushLine(val);
    }
    if (out.length >= 50) break;
  }

  return out.slice(0, 50).join("\n");
}

function isLikelySpaHtml(html: string, visibleText: string): boolean {
  if (visibleText.length < 700) return true;
  return /<script[^>]+type=["']module["']|id=["'](?:root|app|__next)["']|\/(?:assets|_next\/static)\//i.test(
    html,
  );
}

function findSameOriginScripts(html: string, baseUrl: URL): string[] {
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
    .slice(0, 3);
}

function findLazyRouteChunks(
  fetchedScripts: Array<{ url: string; text: string }>,
  baseUrl: URL,
): string[] {
  const alreadyFetched = new Set(fetchedScripts.map((s) => s.url));
  const candidates = new Map<string, number>();
  const assetPathRe =
    /["']((?:\.\.?\/|\/)?(?:assets|_next\/static\/chunks|static\/js)\/[a-zA-Z0-9_./-]+\.js)["']/g;
  const dynamicImportRe =
    /import\(\s*["'](\.\.?\/[a-zA-Z0-9_./-]+\.js)["']\s*\)/g;

  for (const script of fetchedScripts) {
    const parentUrl = new URL(script.url);
    const register = (rawPath: string, fromScript: boolean) => {
      try {
        const resolved = new URL(
          rawPath.startsWith("assets/") ||
            rawPath.startsWith("_next/") ||
            rawPath.startsWith("static/")
            ? `/${rawPath}`
            : rawPath,
          fromScript ? parentUrl : baseUrl,
        );
        if (resolved.origin !== baseUrl.origin) return;
        if (!resolved.pathname.endsWith(".js")) return;
        const urlStr = resolved.toString();
        if (alreadyFetched.has(urlStr)) return;

        const fileName = (
          resolved.pathname.split("/").pop() ?? ""
        ).toLowerCase();
        if (IGNORE_LAZY_CHUNK_RE.test(fileName)) return;

        if (APP_OR_PRICING_SCRIPT_RE.test(fileName)) {
          candidates.set(urlStr, 50);
        }
      } catch {
        // Ignore invalid chunk URL
      }
    };

    for (const m of script.text.matchAll(assetPathRe)) {
      register(m[1], m[1].startsWith("."));
    }
    for (const m of script.text.matchAll(dynamicImportRe)) {
      register(m[1], true);
    }
  }

  return Array.from(candidates.keys()).slice(0, 2);
}

function compactSiteText(rawText: string, maxChars = 4_000): string {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 1 && !ZERO_PRICE_ONLY_RE.test(line));

  const signalRe =
    /(z[łl]|pln|eur|usd|gbp|chf|cad|aud|\$|€|£|,-|cennik|cena|od\s+\d+|from\s+\d+|m²|m2|szt|godz|hour|dzie[ńn]|day|imprez|event|wynajem|us[łl]ug|dojazd|gratis|opinie|price|pricing|rate|specials|coupon|tune-up|tune up|SCHEMA_OFFER|SPA_ITEM)/i;
  const picked = new Set<number>();

  lines.forEach((line, idx) => {
    if (signalRe.test(line)) {
      if (idx > 0) picked.add(idx - 1);
      picked.add(idx);
      if (idx + 1 < lines.length) picked.add(idx + 1);
    }
  });

  // Keep strictly in document order so service labels stay directly above their prices
  const selected = Array.from(picked)
    .sort((a, b) => a - b)
    .map((idx) => lines[idx]);
  const joined = (selected.length > 0 ? selected : lines).join("\n");
  return joined.slice(0, maxChars);
}

function prioritizeCurrencyLines(rawText: string, maxChars: number): string {
  if (rawText.length <= maxChars) return rawText;
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && !ZERO_PRICE_ONLY_RE.test(l));

  // Keep preceding label lines paired with currency lines when trimming long pages for Groq
  const highSignalIndices = new Set<number>();
  lines.forEach((line, idx) => {
    if (CURRENCY_LINE_RE.test(line)) {
      if (idx > 0 && !CURRENCY_LINE_RE.test(lines[idx - 1])) {
        highSignalIndices.add(idx - 1);
      }
      highSignalIndices.add(idx);
    }
  });

  const highSignal = Array.from(highSignalIndices)
    .sort((a, b) => a - b)
    .map((idx) => lines[idx]);
  const rest = lines.filter((_, idx) => !highSignalIndices.has(idx));
  const ordered = [...highSignal, ...rest];

  const chunks: string[] = [];
  let len = 0;
  for (const line of ordered) {
    const next = len + line.length + 1;
    if (next > maxChars) break;
    chunks.push(line);
    len = next;
  }
  return chunks.join("\n");
}

export function buildCompactGroqResearch(
  gbpContext: string,
  fetchedSites: FetchedSiteContext[],
  maxChars = MAX_GROQ_RESEARCH_CHARS,
): string {
  const sections: string[] = [];
  let remaining = maxChars;

  if (gbpContext) {
    const gbpCap = Math.min(3_200, Math.floor(maxChars * 0.34));
    const gbpSlice = gbpContext.slice(0, gbpCap).trim();
    sections.push(gbpSlice);
    remaining -= gbpSlice.length + 2;
  }

  if (fetchedSites.length > 0 && remaining > 400) {
    const sortedSites = [...fetchedSites].sort(
      (a, b) => Number(b.hasPriceSignals) - Number(a.hasPriceSignals),
    );
    const sitesToInclude = sortedSites.slice(0, 9);
    const pricedCount = Math.max(
      1,
      sitesToInclude.filter((s) => s.hasPriceSignals).length,
    );
    const unpricedCount = sitesToInclude.filter(
      (s) => !s.hasPriceSignals,
    ).length;
    const unpricedCap = 240;
    const budgetForPriced = Math.max(
      480,
      Math.floor(
        (remaining - unpricedCount * (unpricedCap + 75)) / pricedCount,
      ) - 70,
    );
    const pricedCap = Math.min(1_500, Math.max(520, budgetForPriced));

    for (const site of sitesToInclude) {
      if (remaining < 180) break;
      const header = `=== SITE: ${site.title.slice(0, 60)} (${site.url}) ===`;
      const targetCap = site.hasPriceSignals ? pricedCap : unpricedCap;
      const compactBody = prioritizeCurrencyLines(
        site.text,
        Math.min(targetCap, Math.max(120, remaining - header.length - 4)),
      );
      if (!compactBody) continue;

      const block = `${header}\n${compactBody}`;
      if (block.length + 2 <= remaining) {
        sections.push(block);
        remaining -= block.length + 2;
      } else if (remaining > 220) {
        sections.push(block.slice(0, remaining));
        remaining = 0;
        break;
      }
    }
  }

  return sections.join("\n\n").slice(0, maxChars);
}

function findPricingSubpageUrls(html: string, baseUrl: URL): string[] {
  const anchorMatches = Array.from(
    html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  );
  const directPricing: string[] = [];
  const secondaryOffer: string[] = [];
  const seen = new Set<string>();

  for (const match of anchorMatches) {
    const href = (match[1] ?? "").trim();
    const label = (match[2] ?? "").replace(/<[^>]+>/g, " ").trim();
    const haystack = `${href} ${label}`.toLowerCase();

    if (
      /\.(jpg|jpeg|png|webp|avif|pdf|svg)$/i.test(href) ||
      /^(?:mailto:|tel:|javascript:)/i.test(href)
    ) {
      continue;
    }

    const isDirectPricing =
      /(cennik|cena|ceny|pricing|price-list|prices|rates|tarif|specials|coupons|deals|promo|estimate|tune-up|cost|fee|financing)/.test(
        haystack,
      );
    const isSecondaryOffer =
      /(oferta|us[łl]ug|pranie-|czyszczen|wynajem|atrakcj|services)/.test(
        haystack,
      );
    if (!isDirectPricing && !isSecondaryOffer) continue;

    try {
      const resolved = new URL(href, baseUrl);
      if (
        resolved.origin === baseUrl.origin &&
        resolved.pathname !== baseUrl.pathname
      ) {
        const urlStr = resolved.toString();
        if (seen.has(urlStr)) continue;
        seen.add(urlStr);
        if (isDirectPricing) {
          directPricing.push(urlStr);
        } else {
          secondaryOffer.push(urlStr);
        }
      }
    } catch {
      continue;
    }
  }
  return [...directPricing, ...secondaryOffer].slice(0, 3);
}

async function fetchHtmlPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 260_000);
  } catch {
    return null;
  }
}

async function fetchJsAsset(
  url: string,
): Promise<{ url: string; text: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const raw = (await res.text()).slice(0, 350_000);
    return { url, text: decodeJsEscapes(raw) };
  } catch {
    return null;
  }
}

export async function fetchSiteContext(
  targetUrl: string,
): Promise<FetchedSiteContext | null> {
  const safeUrl = isSafePublicUrl(targetUrl);
  if (!safeUrl) return null;

  const html = await fetchHtmlPage(safeUrl.toString());
  if (!html) return null;

  const { title, text } = extractVisibleText(html);
  if (isBotChallengePage(title, text)) return null;

  const schemaOffers = extractJsonLdPricingText(html);
  const parts: string[] = [text];
  if (schemaOffers) parts.push(schemaOffers);

  const subpageUrls = findPricingSubpageUrls(html, safeUrl);
  if (subpageUrls.length > 0) {
    const subHtmlList = await Promise.all(
      subpageUrls.map((subUrl) => fetchHtmlPage(subUrl)),
    );
    subHtmlList.forEach((subHtml, idx) => {
      if (!subHtml) return;
      const subVisible = extractVisibleText(subHtml);
      if (
        subVisible.text &&
        !isBotChallengePage(subVisible.title, subVisible.text)
      ) {
        parts.push(`[SUBPAGE ${subpageUrls[idx]}]\n${subVisible.text}`);
      }
      const subSchema = extractJsonLdPricingText(subHtml);
      if (subSchema) parts.push(subSchema);
    });
  }

  let combined = parts.filter(Boolean).join("\n");

  if (!CURRENCY_LINE_RE.test(combined) && isLikelySpaHtml(html, text)) {
    const scriptUrls = findSameOriginScripts(html, safeUrl);
    if (scriptUrls.length > 0) {
      const initialScripts = (
        await Promise.all(scriptUrls.map((u) => fetchJsAsset(u)))
      ).filter((item): item is { url: string; text: string } => item !== null);
      const lazyChunkUrls = findLazyRouteChunks(initialScripts, safeUrl);
      const lazyScripts =
        lazyChunkUrls.length > 0
          ? (
              await Promise.all(lazyChunkUrls.map((u) => fetchJsAsset(u)))
            ).filter(
              (item): item is { url: string; text: string } => item !== null,
            )
          : [];
      const allScripts = [...initialScripts, ...lazyScripts];
      if (allScripts.length > 0) {
        const spaLines = extractSpaPricingLines(allScripts.map((s) => s.text));
        if (spaLines) {
          combined = `${combined}\n[SPA_BUNDLE]\n${spaLines}`.trim();
        }
      }
    }
  }

  const compacted = compactSiteText(combined, 4_000);
  if (!compacted) return null;

  const meaningfulPriceLines = compacted
    .split("\n")
    .some((l) => CURRENCY_LINE_RE.test(l) && !ZERO_PRICE_ONLY_RE.test(l));

  return {
    url: safeUrl.toString(),
    title: title || safeUrl.hostname,
    text: compacted,
    hasPriceSignals: meaningfulPriceLines,
  };
}
