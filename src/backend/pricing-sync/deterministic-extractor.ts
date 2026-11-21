import {
  FALLBACK_SERVICE_RULES,
  inferUnitTypeFromText,
  matchPriceInWindow,
  normalizeCurrency,
  normalizeExtractedServiceKey,
  toAsciiSlug,
  toPln,
} from "./service-rules";
import { isJsArtifactLine } from "./spa-bundle-decoder";
import {
  MAX_AI_CONTEXT_CHARS,
  MAX_EXTRACTED_ITEMS,
  type ExtractedPrice,
  type FallbackKeywordRule,
  type HtmlMetadata,
  type RawOffer,
} from "./types";

function collectJsonLdOffers(node: unknown, out: RawOffer[], parentName = "") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdOffers(item, out, parentName);
    return;
  }
  const record = node as Record<string, unknown>;
  const itemOffered =
    record.itemOffered && typeof record.itemOffered === "object"
      ? (record.itemOffered as Record<string, unknown>)
      : null;
  const ownName =
    typeof record.name === "string"
      ? record.name
      : typeof itemOffered?.name === "string"
        ? itemOffered.name
        : parentName;
  const priceSpec =
    record.priceSpecification && typeof record.priceSpecification === "object"
      ? (record.priceSpecification as Record<string, unknown>)
      : null;
  const rawPrice =
    record.price ?? record.lowPrice ?? priceSpec?.price ?? undefined;

  if (
    ownName &&
    (typeof rawPrice === "number" || typeof rawPrice === "string")
  ) {
    const amount = Number(String(rawPrice).replace(",", ".").trim());
    if (Number.isFinite(amount) && amount > 0) {
      const currency = normalizeCurrency(
        record.priceCurrency ?? priceSpec?.priceCurrency ?? "PLN",
      );
      out.push({ name: ownName, amount, currency });
    }
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      collectJsonLdOffers(value, out, ownName);
    }
  }
}

export function extractFromJsonLd(html: string): Map<string, ExtractedPrice> {
  const results = new Map<string, ExtractedPrice>();
  const scriptRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const offers: RawOffer[] = [];
  for (const match of html.matchAll(scriptRe)) {
    try {
      const parsed = JSON.parse(match[1]) as unknown;
      collectJsonLdOffers(parsed, offers);
    } catch {
      continue;
    }
  }

  for (const offer of offers) {
    let matchedRule: FallbackKeywordRule | null = null;
    for (const entry of FALLBACK_SERVICE_RULES) {
      const matched = entry.patterns.some((re) => {
        const testRe = new RegExp(re.source, re.flags.replace("g", ""));
        return testRe.test(offer.name);
      });
      if (matched) {
        matchedRule = entry;
        break;
      }
    }

    const key =
      matchedRule?.serviceKey ?? normalizeExtractedServiceKey("", offer.name);
    if (!key || results.has(key)) continue;

    results.set(key, {
      serviceKey: key,
      labelPl: matchedRule?.labelPl ?? offer.name.slice(0, 70).trim(),
      labelEn: matchedRule?.labelEn ?? offer.name.slice(0, 70).trim(),
      unitType:
        matchedRule?.unitType ??
        (/m2|m²/i.test(offer.name)
          ? "m2"
          : /szt|pc/i.test(offer.name)
            ? "piece"
            : "fixed"),
      pricePln: toPln(offer.amount, offer.currency),
      detectedAmount: offer.amount,
      detectedCurrency: offer.currency,
      method: "json-ld",
      snippet: offer.name.slice(0, 95).trim(),
    });
  }
  return results;
}

export function buildHighSignalContext(
  metadata: HtmlMetadata,
  lines: string[],
  maxChars = MAX_AI_CONTEXT_CHARS,
): string {
  const headerLines: string[] = [];
  if (metadata.title) headerLines.push(`SITE_TITLE: ${metadata.title}`);
  if (metadata.description) {
    headerLines.push(`SITE_DESC: ${metadata.description}`);
  }
  if (metadata.headings.length > 0) {
    headerLines.push(`SITE_HEADINGS: ${metadata.headings.join(" | ")}`);
  }

  const priceSignalRe =
    /(?:^CATALOG_ITEM:\s|^KEY_PAIR:\s|\d\s*(?:z[łl]|pln|eur|usd|\$|€|,-)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])|(?:€|\$|pln|eur)\s*\d|cennik|cena|od\s+\d|from\s+\d|\/\s*(?:m²|m2|szt|pc|h|godz|dzie[ńn]|day|hour|event|imprez|os))/i;

  const pickedIndices = new Set<number>();
  lines.forEach((line, idx) => {
    if (isJsArtifactLine(line)) return;
    if (priceSignalRe.test(line)) {
      if (
        !line.startsWith("CATALOG_ITEM:") &&
        !line.startsWith("KEY_PAIR:") &&
        idx > 0 &&
        !isJsArtifactLine(lines[idx - 1])
      ) {
        pickedIndices.add(idx - 1);
      }
      pickedIndices.add(idx);
    }
  });

  const seen = new Set<string>();
  const catalogLines: string[] = [];
  const keyLines: string[] = [];
  const generalLines: string[] = [];

  Array.from(pickedIndices)
    .sort((a, b) => a - b)
    .forEach((idx) => {
      const trimmed = lines[idx]?.replace(/\s+/g, " ").trim();
      if (!trimmed || trimmed.length < 3 || seen.has(trimmed)) return;
      seen.add(trimmed);
      if (trimmed.startsWith("CATALOG_ITEM:")) {
        catalogLines.push(trimmed.replace(/^CATALOG_ITEM:\s*/, "- "));
      } else if (trimmed.startsWith("KEY_PAIR:")) {
        keyLines.push(trimmed);
      } else {
        generalLines.push(trimmed);
      }
    });

  if (
    catalogLines.length === 0 &&
    keyLines.length === 0 &&
    generalLines.length === 0
  ) {
    for (const line of lines.slice(0, 60)) {
      const trimmed = line.replace(/\s+/g, " ").trim();
      if (trimmed && !isJsArtifactLine(trimmed) && !seen.has(trimmed)) {
        seen.add(trimmed);
        generalLines.push(trimmed);
      }
    }
  }

  const ordered: string[] = [...headerLines];
  if (catalogLines.length > 0) {
    ordered.push("CATALOG_PRICE_ITEMS:");
    ordered.push(...catalogLines);
  }
  if (keyLines.length > 0) {
    ordered.push("KEYED_PRICES:");
    ordered.push(...keyLines);
  }
  if (generalLines.length > 0) {
    ordered.push("PAGE_PRICE_LINES:");
    ordered.push(...generalLines);
  }

  const chunks: string[] = [];
  let totalLen = 0;
  for (const line of ordered) {
    const nextLen = totalLen + line.length + 1;
    if (nextLen > maxChars) break;
    chunks.push(line);
    totalLen = nextLen;
  }
  return chunks.join("\n");
}

export function parseCatalogItemsFromContext(
  contextLines: string[],
  hasSpaBundle: boolean,
): ExtractedPrice[] {
  const items: ExtractedPrice[] = [];
  const seenKeys = new Set<string>();

  for (const line of contextLines) {
    if (!line.startsWith("CATALOG_ITEM:")) continue;
    const match = line.match(
      /^CATALOG_ITEM:\s*(.+?)\s*:\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(PLN|USD|EUR)(?:\s*\/\s*(.+))?$/i,
    );
    if (!match) continue;
    const rawLabel = match[1].trim();
    const amount = Number(match[2].replace(",", "."));
    const currency = normalizeCurrency(match[3]);
    const period = (match[4] ?? "").trim();
    if (!rawLabel || !Number.isFinite(amount) || amount <= 0) continue;

    const unitSuffix = period ? ` (${period})` : "";
    const fullLabel = `${rawLabel}${unitSuffix}`.slice(0, 80);
    const slug = toAsciiSlug(fullLabel);
    if (!slug) continue;
    const key = `live:${slug}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    items.push({
      serviceKey: key,
      labelPl: fullLabel,
      labelEn: fullLabel,
      unitType: inferUnitTypeFromText(period || rawLabel),
      pricePln: toPln(amount, currency),
      detectedAmount: amount,
      detectedCurrency: currency,
      method: hasSpaBundle ? "spa-bundle" : "html-text",
      snippet: rawLabel.slice(0, 110),
    });
  }

  return items;
}

export function extractDeterministicFallback(
  contextLines: string[],
  html: string,
  hasSubpages: boolean,
  hasSpaBundle: boolean,
): ExtractedPrice[] {
  const byService = extractFromJsonLd(html);

  for (const catalogItem of parseCatalogItemsFromContext(
    contextLines,
    hasSpaBundle,
  )) {
    if (!byService.has(catalogItem.serviceKey)) {
      byService.set(catalogItem.serviceKey, catalogItem);
    }
  }

  interface CleanSegment {
    searchTarget: string;
    priceTarget: string;
    snippet: string;
  }

  const segments: CleanSegment[] = [];
  const plainLines: string[] = [];

  for (const line of contextLines) {
    if (line.startsWith("CATALOG_ITEM:") || line.startsWith("SITE_")) continue;
    if (line.startsWith("KEY_PAIR:")) {
      const rawBody = line.slice("KEY_PAIR:".length).trim();
      const colonIdx = rawBody.indexOf(":");
      if (colonIdx > 0) {
        const keyPart = rawBody.slice(0, colonIdx).trim();
        const valPart = rawBody.slice(colonIdx + 1).trim();
        if (!valPart || /^\s*\+/.test(valPart)) continue;
        if (/^(?:info|faq|cushions)\b/i.test(keyPart)) continue;
        segments.push({
          searchTarget: `${keyPart} ${valPart}`,
          priceTarget: valPart,
          snippet: valPart.slice(0, 110),
        });
      } else if (rawBody && !/^\s*\+/.test(rawBody)) {
        segments.push({
          searchTarget: rawBody,
          priceTarget: rawBody,
          snippet: rawBody.slice(0, 110),
        });
      }
      continue;
    }

    const cleaned = line.trim();
    if (cleaned.length > 1) {
      plainLines.push(cleaned);
      segments.push({
        searchTarget: cleaned,
        priceTarget: cleaned,
        snippet: cleaned.slice(0, 110),
      });
    }
  }

  const defaultMethod: ExtractedPrice["method"] = hasSubpages
    ? "subpage"
    : hasSpaBundle
      ? "spa-bundle"
      : "html-text";

  const tryMatchSegment = (
    entry: FallbackKeywordRule,
    seg: CleanSegment,
    useWindowFromMatch: boolean,
  ): boolean => {
    for (const pattern of entry.patterns) {
      const testRe = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      const match = seg.searchTarget.match(testRe);
      if (!match || match.index === undefined) continue;
      const candidateWindow = useWindowFromMatch
        ? seg.priceTarget.slice(match.index, match.index + 140)
        : seg.priceTarget;
      const found =
        matchPriceInWindow(candidateWindow) ??
        (seg.priceTarget.length <= 140
          ? matchPriceInWindow(seg.priceTarget)
          : null);
      if (found) {
        byService.set(entry.serviceKey, {
          serviceKey: entry.serviceKey,
          labelPl: entry.labelPl,
          labelEn: entry.labelEn,
          unitType: entry.unitType,
          ...found,
          method: defaultMethod,
          snippet: seg.snippet,
        });
        return true;
      }
    }
    return false;
  };

  if (byService.size < 4) {
    for (const entry of FALLBACK_SERVICE_RULES) {
      if (byService.has(entry.serviceKey)) continue;
      let matched = false;
      for (let i = 0; i < segments.length && !matched; i++) {
        const isKeyed = segments[i].searchTarget !== segments[i].priceTarget;
        matched = tryMatchSegment(entry, segments[i], !isKeyed);
      }

      if (!matched) {
        for (let i = 0; i < plainLines.length - 1 && !matched; i++) {
          const pair = `${plainLines[i]} · ${plainLines[i + 1]}`;
          if (pair.length <= 180) {
            matched = tryMatchSegment(
              entry,
              {
                searchTarget: pair,
                priceTarget: pair,
                snippet: pair.slice(0, 110),
              },
              true,
            );
          }
        }
      }
    }
  }

  return Array.from(byService.values()).slice(0, MAX_EXTRACTED_ITEMS);
}
