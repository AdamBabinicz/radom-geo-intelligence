import { matchPriceInWindow, normalizeCurrency } from "./service-rules";
import type { JsStringDictionary } from "./types";

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

export function isJsArtifactLine(line: string): boolean {
  return (
    /\$1|\$2|=>|&&|\{\}|\bfunction\s*\(|\bclassName\b|\bdisplayName\b|\bcreateElement\b|^\s*[,;\]})]/i.test(
      line,
    ) ||
    /^(?:https?:|\/assets\/|\/static\/|#|rgba?\(|M\d|L\d|(?:flex|grid|text|bg|px|py|mx|my|rounded|border|shadow)-)/i.test(
      line,
    )
  );
}

function formatReadableKeySlug(rawKey: string): string {
  return rawKey
    .replace(
      /^(?:attractionsData|specification\.label|modalContent|service|services|offer|offers|pricing|priceList)\./i,
      "",
    )
    .replace(/(?:PriceTag|Price|Cost|Rate|Fee|Item|RentalItem)$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBalancedObjectSlice(
  source: string,
  braceStartIdx: number,
  maxLen = 28_000,
): string {
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  const limit = Math.min(source.length, braceStartIdx + maxLen);
  for (let i = braceStartIdx; i < limit; i += 1) {
    const ch = source[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStartIdx + 1, i);
      }
    }
  }
  return "";
}

function extractParenCallSlice(
  source: string,
  parenStartIdx: number,
  maxLen = 2_400,
): string {
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  const limit = Math.min(source.length, parenStartIdx + maxLen);
  for (let i = parenStartIdx; i < limit; i += 1) {
    const ch = source[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(parenStartIdx, i + 1);
      }
    }
  }
  return "";
}

function extractJsxChildrenExpr(elementSlice: string): string {
  const childrenIdx = elementSlice.indexOf("children:");
  if (childrenIdx !== -1) {
    let i = childrenIdx + "children:".length;
    while (i < elementSlice.length && /\s/.test(elementSlice[i])) i += 1;
    let depth = 0;
    let inStr: string | null = null;
    let esc = false;
    for (let j = i; j < elementSlice.length; j += 1) {
      const ch = elementSlice[j];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === "\\") {
          esc = true;
          continue;
        }
        if (ch === inStr) {
          inStr = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        depth += 1;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        if (depth === 0) return elementSlice.slice(i, j);
        depth -= 1;
      } else if (ch === "," && depth === 0) {
        return elementSlice.slice(i, j);
      }
    }
    return elementSlice.slice(i);
  }

  let commaCount = 0;
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  for (let i = 0; i < elementSlice.length; i += 1) {
    const ch = elementSlice[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
    } else if (ch === "," && depth === 1) {
      commaCount += 1;
      if (commaCount === 2) {
        return elementSlice.slice(i + 1, -1);
      }
    }
  }
  return "";
}

function buildSharedJsDictionary(jsTexts: string[]): JsStringDictionary {
  const flat = new Map<string, string>();
  const scoped = new Map<string, string>();
  const keyPairRe =
    /(?:["']([a-zA-Z0-9_.-]{2,90})["']|([a-zA-Z0-9_.-]{2,48}))\s*:\s*(?:"((?:[^"\\]|\\.){1,220})"|'((?:[^'\\]|\\.){1,220})')/g;
  const nsRe =
    /(?:["']([a-zA-Z0-9_-]{2,48})["']|([a-zA-Z0-9_-]{2,48}))\s*:\s*\{/g;

  for (const js of jsTexts) {
    for (const match of js.matchAll(keyPairRe)) {
      const key = match[1] ?? match[2];
      const value = (match[3] ?? match[4] ?? "").replace(/\s+/g, " ").trim();
      if (!key || !value || isJsArtifactLine(value)) continue;
      if (!flat.has(key)) {
        flat.set(key, value);
      }
    }

    for (const nsMatch of js.matchAll(nsRe)) {
      const ns = nsMatch[1] ?? nsMatch[2];
      if (!ns) continue;
      const braceIdx = (nsMatch.index ?? 0) + nsMatch[0].length - 1;
      const block = extractBalancedObjectSlice(js, braceIdx);
      if (!block || block.includes("=>") || block.includes("children:")) {
        continue;
      }
      for (const km of block.matchAll(keyPairRe)) {
        const key = km[1] ?? km[2];
        const value = (km[3] ?? km[4] ?? "").replace(/\s+/g, " ").trim();
        if (!key || !value || isJsArtifactLine(value)) continue;
        const fullKey = `${ns}.${key}`;
        if (!scoped.has(fullKey)) {
          scoped.set(fullKey, value);
        }
      }
    }
  }

  return { flat, scoped };
}

function resolveDictionaryKey(
  key: string | undefined,
  dict: JsStringDictionary,
  fallbackToSlug = false,
): string {
  if (!key) return "";
  if (dict.scoped.has(key)) return dict.scoped.get(key) ?? "";
  if (dict.flat.has(key)) return dict.flat.get(key) ?? "";
  const tail = key.split(".").pop();
  if (tail && dict.flat.has(tail)) return dict.flat.get(tail) ?? "";
  return fallbackToSlug ? formatReadableKeySlug(key) : "";
}

function evaluateJsxCellText(expr: string, dict: JsStringDictionary): string {
  const sanitized = expr
    .replace(
      /\b(?:className|class|id|key|style|variant|size|aria-[a-z-]+|data-[a-z-]+)\s*:\s*(?:"[^"]*"|'[^']*')/g,
      "",
    )
    .replace(/(?:\.jsxs?|\.createElement)\(\s*["'][a-zA-Z0-9]+["']\s*,/g, "(")
    .replace(
      /[a-zA-Z0-9_$.]+\s*\?\s*(?:"([^"\\]{1,16})"|'([^'\\]{1,16})')\s*:\s*(?:"[^"\\]{1,16}"|'[^'\\]{1,16}')/g,
      (_, firstA: string | undefined, firstB: string | undefined) =>
        JSON.stringify(firstA ?? firstB ?? ""),
    );

  const parts: string[] = [];
  const tokenRe =
    /(?:[a-zA-Z_$][a-zA-Z0-9_$.]*\(\s*(?:"([a-zA-Z0-9_.-]{2,90})"|'([a-zA-Z0-9_.-]{2,90})')[^)]*\))|(?:"((?:[^"\\]|\\.){1,180})"|'((?:[^'\\]|\\.){1,180})')/g;

  for (const match of sanitized.matchAll(tokenRe)) {
    const i18nKey = match[1] ?? match[2];
    if (i18nKey) {
      const resolved = resolveDictionaryKey(i18nKey, dict, false);
      if (resolved) parts.push(resolved);
    } else {
      const literal = (match[3] ?? match[4] ?? "").trim();
      if (literal && !isJsArtifactLine(literal)) {
        parts.push(literal);
      }
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function decodeJsBundles(rawBundles: string[]): string[] {
  const jsTexts = rawBundles.map(decodeJsEscapes).filter(Boolean);
  if (jsTexts.length === 0) return [];

  const dict = buildSharedJsDictionary(jsTexts);
  const out: string[] = [];
  const seen = new Set<string>();
  let catalogCount = 0;

  const pushLine = (line: string) => {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean || clean.length < 4 || seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  const objPriceRe =
    /\b(?:base|price|cost|amount|rate|fee|minPrice|startingPrice)\s*:\s*(\d{1,6}(?:[.,]\d{1,2})?)\b/g;
  const catalogEntries: Array<{
    primary: string;
    label: string;
    period: string;
    line: string;
  }> = [];

  for (const js of jsTexts) {
    for (const match of js.matchAll(objPriceRe)) {
      const num = Number(match[1].replace(",", "."));
      if (!Number.isFinite(num) || num <= 0 || num > 100_000) continue;

      const idx = match.index ?? 0;
      const openBrace = js.lastIndexOf("{", idx);
      const closeBrace = js.indexOf("}", idx);
      const ownStart =
        openBrace !== -1
          ? Math.max(openBrace, idx - 260)
          : Math.max(0, idx - 200);
      const ownEnd =
        closeBrace > idx ? Math.min(closeBrace + 1, idx + 240) : idx + 200;
      const ownObj = js.slice(ownStart, ownEnd);

      const currencyRaw = ownObj.match(
        /\bcurrency\s*:\s*["']([a-zA-Z$€]{1,5})["']/i,
      )?.[1];
      const period =
        ownObj.match(/\bperiod\s*:\s*["']([^"']{1,40})["']/i)?.[1]?.trim() ??
        "";
      if (/^gratis|free$/i.test(period)) continue;

      const ownName = ownObj.match(
        /\b(?:name|title)\s*:\s*["']([^"']{2,90})["']/i,
      )?.[1];
      const ownLabelKey = ownObj.match(
        /\b(?:labelKey|titleKey|nameKey)\s*:\s*["']([^"']{2,90})["']/i,
      )?.[1];
      const ownCapKey = ownObj.match(
        /\b(?:capacityKey|variantKey|optionKey)\s*:\s*["']([^"']{2,90})["']/i,
      )?.[1];
      const ownDescKey = ownObj.match(
        /\bdescriptionKey\s*:\s*["']([^"']{2,90})["']/i,
      )?.[1];

      if (!currencyRaw && !period && !ownName && !ownLabelKey) continue;

      const widerLeft = js.slice(Math.max(0, idx - 1800), idx);
      const parentNameMatches = Array.from(
        widerLeft.matchAll(/\bname\s*:\s*["']([^"']{2,80})["']/g),
      );
      const parentName =
        parentNameMatches.length > 0
          ? parentNameMatches[parentNameMatches.length - 1][1]
          : "";
      const parentTitleMatches = Array.from(
        widerLeft.matchAll(/\btitle\s*:\s*["']([^"']{2,80})["']/g),
      );
      const parentTitle =
        parentTitleMatches.length > 0
          ? parentTitleMatches[parentTitleMatches.length - 1][1]
          : "";

      const primaryLabel = ownName || parentName || parentTitle;
      const resolvedLabel = ownLabelKey
        ? resolveDictionaryKey(ownLabelKey, dict, true)
        : "";
      const resolvedDesc = ownDescKey
        ? resolveDictionaryKey(ownDescKey, dict, true)
        : "";
      const resolvedCap = ownCapKey
        ? resolveDictionaryKey(ownCapKey, dict, true)
        : "";

      const labelParts = [
        primaryLabel,
        resolvedLabel,
        resolvedDesc,
        resolvedCap,
      ].filter((part, i, arr) => Boolean(part) && arr.indexOf(part) === i);

      if (labelParts.length === 0) continue;

      const fullLabel = labelParts.join(" — ");
      const currency = normalizeCurrency(currencyRaw || "PLN");
      const periodSuffix = period ? ` / ${period}` : "";
      catalogEntries.push({
        primary: primaryLabel,
        label: fullLabel,
        period,
        line: `CATALOG_ITEM: ${fullLabel} : ${num} ${currency}${periodSuffix}`,
      });
    }
  }

  const primariesWithDetails = new Set(
    catalogEntries
      .filter((e) => e.primary && !/^od|from$/i.test(e.period))
      .map((e) => e.primary),
  );
  for (const entry of catalogEntries) {
    if (
      /^od|from$/i.test(entry.period) &&
      entry.label === entry.primary &&
      primariesWithDetails.has(entry.primary)
    ) {
      continue;
    }
    pushLine(entry.line);
    catalogCount += 1;
  }

  for (const js of jsTexts) {
    const trRe = /(?:\.jsxs?|\.createElement)\(\s*["']tr["']\s*,/g;
    for (const trMatch of js.matchAll(trRe)) {
      const parenIdx = (trMatch.index ?? 0) + trMatch[0].indexOf("(");
      const trSlice = extractParenCallSlice(js, parenIdx, 2_200);
      if (!trSlice) continue;

      const cells: string[] = [];
      const tdRe = /(?:\.jsxs?|\.createElement)\(\s*["']td["']\s*,/g;
      for (const tdMatch of trSlice.matchAll(tdRe)) {
        const tdParenIdx = (tdMatch.index ?? 0) + tdMatch[0].indexOf("(");
        const tdSlice = extractParenCallSlice(trSlice, tdParenIdx, 800);
        if (!tdSlice) continue;
        const childrenExpr = extractJsxChildrenExpr(tdSlice);
        if (!childrenExpr) continue;
        const cellText = evaluateJsxCellText(childrenExpr, dict);
        if (cellText) cells.push(cellText);
      }

      if (cells.length < 2) continue;

      const rawLabel = cells[0].trim();
      const rawPriceCell = cells.slice(1).join(" ").trim();
      if (!rawLabel || rawLabel.length > 100) continue;
      if (
        /^(?:us[łl]uga|service|nazwa|name|opis|description)$/i.test(rawLabel)
      ) {
        continue;
      }
      if (
        /(?:dojazd|transport|kaucj|zadatek|deposit|travel|delivery|free|gratis)/i.test(
          rawLabel,
        )
      ) {
        continue;
      }

      const parsedPrice = matchPriceInWindow(rawPriceCell);
      if (!parsedPrice) continue;

      const tierPrefix = rawPriceCell.match(
        /^((?:powy[żz]ej|poni[żz]ej|do|above|over|under|up\s+to)\s+\d+\s*(?:m²|m2|szt\.?|os\.?))(?=$|\s)/i,
      )?.[1];
      const fullLabel =
        tierPrefix && !rawLabel.toLowerCase().includes(tierPrefix.toLowerCase())
          ? `${rawLabel} (${tierPrefix})`
          : rawLabel;

      const unitTarget = tierPrefix
        ? rawPriceCell.slice(tierPrefix.length)
        : rawPriceCell;
      const isPerM2 = /(?:\/\s*(?:m²|m2)|m²|m2)/i.test(unitTarget);
      const isPerPc = /(?:\/\s*(?:szt|pc|pcs)|szt\.?\b)/i.test(unitTarget);
      const periodSuffix = isPerM2 ? " / m2" : isPerPc ? " / szt" : "";

      pushLine(
        `CATALOG_ITEM: ${fullLabel} : ${parsedPrice.detectedAmount} ${parsedPrice.detectedCurrency}${periodSuffix}`,
      );
      catalogCount += 1;
    }
  }

  const priceTextRe =
    /(?:\d\s*(?:z[łl]|pln|eur|usd|\$|€|,-)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])|(?:€|\$|pln|eur)\s*\d)/i;
  for (const [key, value] of dict.flat.entries()) {
    if (value.length > 180 || !priceTextRe.test(value)) continue;
    if (catalogCount >= 4 && /PriceTag$/i.test(key)) continue;
    if (
      /^(?:€|\$|usd|eur)?\s*\d+(?:[.,]\d+)?\s*(?:z[łl]|pln)?$/i.test(value) &&
      key.length < 3
    ) {
      continue;
    }
    const baseKey = key.replace(/(?:PriceTag|Price|Cost|Rate|Fee)$/i, "");
    const resolvedBase =
      baseKey !== key
        ? (dict.flat.get(baseKey) ?? dict.flat.get(`${baseKey}Cleaning`) ?? "")
        : "";
    const basePrefix = resolvedBase ? `${resolvedBase} — ` : "";
    const readableKey = formatReadableKeySlug(key);
    const prefix = readableKey ? `${readableKey}: ` : "";
    pushLine(`KEY_PAIR: ${prefix}${basePrefix}${value}`);
  }

  const literalRe = /(?:"((?:[^"\\]|\\.){4,220})"|'((?:[^'\\]|\\.){4,220})')/g;
  for (const js of jsTexts) {
    for (const match of js.matchAll(literalRe)) {
      const val = (match[1] ?? match[2] ?? "").replace(/\s+/g, " ").trim();
      if (!val || isJsArtifactLine(val) || !priceTextRe.test(val)) continue;
      pushLine(val);
    }
  }

  return out;
}
