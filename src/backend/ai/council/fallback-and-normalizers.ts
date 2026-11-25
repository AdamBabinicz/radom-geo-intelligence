import {
  convertToPln,
  formatPrice,
  getLocaleCurrencyConfig,
  normalizeDisplayCurrency,
  type DisplayCurrency,
} from "../../../lib/currency";
import {
  formatTemplate,
  resolveLocale,
  translations,
  type Locale,
} from "../../../locales";
import type {
  CouncilDebateResult,
  CouncilDecisionOption,
  CouncilInvariantViolation,
  CouncilMeasurementReport,
  CouncilPriceAdjustment,
  CouncilPriceMove,
  CouncilRequestInput,
  CouncilServiceInput,
  RawSynthesisOption,
} from "./types";

export function stripForeignPlnSuffix(text: string): string {
  return text
    .replace(
      /\b~?\d+(?:[.,]\d+)?\s*(?:PLN|zł)\s*\(\s*~?(\$[\d.,]+)(?:\s*USD)?\s*\)/gi,
      "$1",
    )
    .replace(/\s*\(\s*~?\d+(?:[.,]\d+)?\s*(?:PLN|zł)\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildCompactMarketBrief(input: CouncilRequestInput): string {
  const locale = resolveLocale(input.locale);
  const currency = input.currency;
  const resolvedIndustry = input.industryLabel?.trim() || input.industryId;
  const servicesLines = input.services
    .slice(0, 12)
    .map((s) => {
      const gap =
        s.localPricePln > 0
          ? `${Math.round(((s.ourPricePln - s.localPricePln) / s.localPricePln) * 100)}%`
          : "n/a";
      const ourFormatted = formatPrice(s.ourPricePln, locale, currency);
      const localFormatted =
        s.localPricePln > 0
          ? formatPrice(s.localPricePln, locale, currency)
          : "none";
      const localUnitsPart =
        s.localPricePln > 0 ? ` (baseUnits=${s.localPricePln})` : "";
      return `- [${s.serviceKey}] ${s.label}: our=${ourFormatted} (baseUnits=${s.ourPricePln}), localAvg=${localFormatted}${localUnitsPart} (gap ${gap})`;
    })
    .join("\n");

  const compLines = input.competitors
    .slice(0, 6)
    .map(
      (c) =>
        `- ${c.name}${c.rating ? ` ★${c.rating}(${c.reviewCount ?? 0})` : ""}: ${c.priceSummary}`,
    )
    .join("\n");

  const painLines = input.painPoints
    .slice(0, 4)
    .map(
      (p) => `- ${p.label} (${p.score}%)${p.evidence ? `: ${p.evidence}` : ""}`,
    )
    .join("\n");

  const lessonsBlock =
    input.lessonsLearned && input.lessonsLearned.length > 0
      ? `Operator's prior Lessons Learned (MUST honor these):\n${input.lessonsLearned
          .slice(0, 6)
          .map((l) => `- ${l}`)
          .join("\n")}`
      : "";

  const humanConstraintBlock = input.humanNote?.trim()
    ? `Active Human Operator Constraint (HIGHEST PRIORITY): ${input.humanNote.trim()}`
    : "";

  return [
    `City: ${input.city} | Industry: ${resolvedIndustry} | Radius: ${input.radiusKm} km | Avg Market Gap: ${input.avgGapPct}%`,
    `Towns in zone: ${input.townsInRadius.slice(0, 10).join(", ")}`,
    `Services:\n${servicesLines || "- none"}`,
    compLines ? `Competitors:\n${compLines}` : "",
    painLines ? `Customer pain points:\n${painLines}` : "",
    lessonsBlock,
    humanConstraintBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function clampPriceMoves(
  rawMoves: Array<{
    serviceKey?: string;
    label?: string;
    currentPricePln?: number;
    proposedPricePln?: number;
    rationale?: string;
  }>,
  services: CouncilServiceInput[],
): CouncilPriceMove[] {
  const byKey = new Map(services.map((s) => [s.serviceKey, s]));
  const out: CouncilPriceMove[] = [];
  const seen = new Set<string>();
  for (const m of rawMoves) {
    const key = String(m.serviceKey ?? "").trim();
    if (!key || seen.has(key)) continue;
    const base = byKey.get(key);
    const current = base?.ourPricePln ?? Number(m.currentPricePln);
    const proposed = Number(m.proposedPricePln);
    if (!Number.isFinite(current) || current <= 0) continue;
    if (!Number.isFinite(proposed) || proposed <= 0) continue;
    seen.add(key);
    out.push({
      serviceKey: key,
      label: String(m.label || base?.label || key).slice(0, 75),
      currentPricePln: Math.round(current),
      proposedPricePln: Math.round(proposed),
      rationale: String(m.rationale ?? "").slice(0, 180),
    });
    if (out.length >= 4) break;
  }
  return out;
}

interface ParsedRuleBound {
  amountPln: number;
  rawText: string;
}

function detectRuleCurrency(
  snippet: string,
  fallbackCurrency: DisplayCurrency,
): DisplayCurrency {
  if (/(\$|usd\b)/i.test(snippet)) return "USD";
  if (/(€|eur\b)/i.test(snippet)) return "EUR";
  if (/(£|gbp\b)/i.test(snippet)) return "GBP";
  if (/(zł|zl\b|pln\b)/i.test(snippet)) return "PLN";
  return fallbackCurrency;
}

function extractNumericBound(
  rulesText: string[],
  pattern: RegExp,
  fallbackCurrency: DisplayCurrency,
): ParsedRuleBound | undefined {
  for (const text of rulesText) {
    const match = text.match(pattern);
    if (!match) continue;
    const numericToken = (match[1] || match[2] || "").replace(",", ".");
    const parsedVal = Number.parseFloat(numericToken);
    if (!Number.isFinite(parsedVal) || parsedVal <= 0) continue;
    const detectedCurrency = detectRuleCurrency(match[0], fallbackCurrency);
    return {
      amountPln: Math.max(1, convertToPln(parsedVal, detectedCurrency)),
      rawText: text,
    };
  }
  return undefined;
}

function doesRuleTargetService(
  ruleText: string,
  serviceLabel: string,
  serviceKey: string,
): boolean {
  const normalizedRule = ruleText.toLowerCase();
  const tokens = `${serviceLabel} ${serviceKey}`
    .toLowerCase()
    .split(/[^a-z0-9ąćęłńóśźż]+/i)
    .filter((tok) => tok.length >= 4);
  if (tokens.length === 0) return false;
  return tokens.some((tok) => normalizedRule.includes(tok));
}

export function measureAndEnforceCouncilPolicy(
  options: [CouncilDecisionOption, CouncilDecisionOption],
  input: CouncilRequestInput,
): {
  options: [CouncilDecisionOption, CouncilDecisionOption];
  policyMeasurement: CouncilMeasurementReport;
} {
  const locale = resolveLocale(input.locale);
  const activeCurrency =
    input.currency ?? getLocaleCurrencyConfig(locale).currency;

  const rulesPool = [
    ...(input.humanNote?.trim() ? [input.humanNote.trim()] : []),
    ...(input.lessonsLearned ?? []).map((l) => l.trim()).filter(Boolean),
  ];

  const capRule = extractNumericBound(
    rulesPool,
    /(?:cap|max(?:imum)?|under|below|at most|limit|nie przekraczaj|nie podnoś(?:[^0-9]{0,24})?(?:powyżej|nad)|maks(?:ymalnie)?|do\s+kwoty|poniżej)\D{0,24}(?:[$€£]\s*)?(\d+(?:[.,]\d+)?)\s*(?:pln|zł|zl|usd|eur|gbp|\$|€|£)?/i,
    activeCurrency,
  );
  const floorRule = extractNumericBound(
    rulesPool,
    /(?:floor|min(?:imum)?|at least|above|co najmniej|nie mniej niż|powyżej)\D{0,24}(?:[$€£]\s*)?(\d+(?:[.,]\d+)?)\s*(?:pln|zł|zl|usd|eur|gbp|\$|€|£)?/i,
    activeCurrency,
  );

  const violations: CouncilInvariantViolation[] = [];
  let checksTotal = 0;

  const anyCapTargetMatch = capRule
    ? options.some((opt) =>
        opt.priceAdjustments.some((adj) =>
          doesRuleTargetService(capRule.rawText, adj.label, adj.serviceKey),
        ),
      )
    : false;
  const anyFloorTargetMatch = floorRule
    ? options.some((opt) =>
        opt.priceAdjustments.some((adj) =>
          doesRuleTargetService(floorRule.rawText, adj.label, adj.serviceKey),
        ),
      )
    : false;

  const enforceOption = (opt: CouncilDecisionOption): CouncilDecisionOption => {
    const adjusted = opt.priceAdjustments.map((adj) => {
      let price = Math.round(adj.finalPricePln);
      const base = Math.max(1, Math.round(adj.currentPricePln));

      checksTotal += 1;
      if (!Number.isFinite(price) || price <= 0) {
        const enforced = base;
        violations.push({
          optionId: opt.id,
          serviceKey: adj.serviceKey,
          rule: "positive_price",
          requestedPricePln: Number.isFinite(price) ? price : 0,
          enforcedPricePln: enforced,
        });
        price = enforced;
      }

      checksTotal += 1;
      const minStepBound = Math.max(1, Math.round(base * 0.6));
      const maxStepBound = Math.max(minStepBound, Math.round(base * 1.65));
      if (price > maxStepBound || price < minStepBound) {
        const clamped = Math.min(maxStepBound, Math.max(minStepBound, price));
        violations.push({
          optionId: opt.id,
          serviceKey: adj.serviceKey,
          rule: "max_step_pct",
          requestedPricePln: price,
          enforcedPricePln: clamped,
        });
        price = clamped;
      }

      if (capRule) {
        const appliesToService = anyCapTargetMatch
          ? doesRuleTargetService(capRule.rawText, adj.label, adj.serviceKey)
          : base <= capRule.amountPln * 1.4;
        if (appliesToService) {
          checksTotal += 1;
          if (price > capRule.amountPln) {
            violations.push({
              optionId: opt.id,
              serviceKey: adj.serviceKey,
              rule: "human_cap",
              requestedPricePln: price,
              enforcedPricePln: capRule.amountPln,
            });
            price = capRule.amountPln;
          }
        }
      }

      if (floorRule) {
        const appliesToService = anyFloorTargetMatch
          ? doesRuleTargetService(floorRule.rawText, adj.label, adj.serviceKey)
          : true;
        if (appliesToService) {
          checksTotal += 1;
          const safeFloor =
            capRule && capRule.amountPln < floorRule.amountPln
              ? capRule.amountPln
              : floorRule.amountPln;
          if (price < safeFloor) {
            violations.push({
              optionId: opt.id,
              serviceKey: adj.serviceKey,
              rule: "human_floor",
              requestedPricePln: price,
              enforcedPricePln: safeFloor,
            });
            price = safeFloor;
          }
        }
      }

      return {
        ...adj,
        finalPricePln: price,
      };
    });

    return {
      ...opt,
      priceAdjustments: adjusted,
    };
  };

  const enforcedOptions: [CouncilDecisionOption, CouncilDecisionOption] = [
    enforceOption(options[0]),
    enforceOption(options[1]),
  ];

  const checksPassed = Math.max(0, checksTotal - violations.length);

  return {
    options: enforcedOptions,
    policyMeasurement: {
      passed: violations.length === 0,
      checksTotal,
      checksPassed,
      enforcedCorrections: violations.length,
      parsedMaxCapPln: capRule?.amountPln,
      parsedMinFloorPln: floorRule?.amountPln,
      violations,
    },
  };
}

export function buildGroundedFallbackCouncil(
  input: CouncilRequestInput,
  fallbackNotice?: string,
): CouncilDebateResult {
  const locale = resolveLocale(input.locale);
  const currency = normalizeDisplayCurrency(
    input.currency,
    getLocaleCurrencyConfig(locale).currency,
  );
  const t = translations[locale];
  const isCustomOrNonUpholstery =
    Boolean(input.industryLabel?.trim()) || input.industryId !== "upholstery";
  const underpriced = input.services
    .filter((s) => s.localPricePln > 0 && s.ourPricePln < s.localPricePln)
    .sort(
      (a, b) =>
        (b.localPricePln - b.ourPricePln) / b.localPricePln -
        (a.localPricePln - a.ourPricePln) / a.localPricePln,
    );
  const topTargets = (
    underpriced.length > 0 ? underpriced : input.services
  ).slice(0, 3);

  const priceMoves: CouncilPriceMove[] = topTargets.map((s) => {
    const target =
      s.localPricePln > s.ourPricePln
        ? Math.round(s.ourPricePln + (s.localPricePln - s.ourPricePln) * 0.65)
        : Math.round(s.ourPricePln * 1.08);
    return {
      serviceKey: s.serviceKey,
      label: s.label,
      currentPricePln: s.ourPricePln,
      proposedPricePln: target,
      rationale:
        s.localPricePln > 0
          ? formatTemplate(t.councilFallbackRationaleGap, {
              city: input.city,
              avg: formatPrice(s.localPricePln, locale, currency),
            })
          : formatTemplate(t.councilFallbackRationaleMargin, {
              radiusKm: input.radiusKm,
            }),
    };
  });

  const topPain = input.painPoints[0]?.label;
  const secondaryTowns =
    input.townsInRadius.slice(1, 4).join(", ") || input.city;

  const safeAdjustments: CouncilPriceAdjustment[] = topTargets.map((s) => {
    const gentle =
      s.localPricePln > s.ourPricePln
        ? Math.round(s.ourPricePln + (s.localPricePln - s.ourPricePln) * 0.35)
        : s.ourPricePln;
    return {
      serviceKey: s.serviceKey,
      label: s.label,
      currentPricePln: s.ourPricePln,
      finalPricePln: gentle,
    };
  });

  const marginAdjustments: CouncilPriceAdjustment[] = priceMoves.map((m) => ({
    serviceKey: m.serviceKey,
    label: m.label,
    currentPricePln: m.currentPricePln,
    finalPricePln: m.proposedPricePln,
  }));

  const humanSuffix = input.humanNote?.trim()
    ? ` ${formatTemplate(t.councilFallbackHumanRuleSuffix, {
        note: input.humanNote.trim(),
      })}`
    : "";

  const addOnCounterProposal = isCustomOrNonUpholstery
    ? t.councilFallbackCounterAddonsCustom
    : t.councilFallbackCounterAddonsUpholstery;

  const marginActionMiddle = isCustomOrNonUpholstery
    ? t.councilFallbackMarginActionCustom
    : formatTemplate(t.councilFallbackMarginActionUpholstery, {
        threshold: formatPrice(200, locale, currency),
      });

  const sensitivityReason = topPain
    ? formatTemplate(t.councilFallbackSensitivityWithPain, { pain: topPain })
    : t.councilFallbackSensitivityDefault;

  const rawOptions: [CouncilDecisionOption, CouncilDecisionOption] = [
    {
      id: "safe",
      title: t.councilOptionSafeTitle,
      summary: t.councilFallbackSafeSummary,
      priceAdjustments: safeAdjustments,
      actionItems: [
        formatTemplate(t.councilFallbackSafeAction1, {
          city: input.city,
          radiusKm: input.radiusKm,
        }),
        formatTemplate(t.councilFallbackSafeAction2, {
          towns: secondaryTowns,
        }),
        t.councilFallbackSafeAction3,
      ],
    },
    {
      id: "margin",
      title: t.councilOptionMarginTitle,
      summary: t.councilFallbackMarginSummary,
      priceAdjustments: marginAdjustments,
      actionItems: [
        formatTemplate(t.councilFallbackMarginAction1, {
          services: topTargets.map((item) => item.label).join(", "),
        }),
        marginActionMiddle,
        formatTemplate(t.councilFallbackMarginAction3, {
          towns: secondaryTowns,
        }),
      ],
    },
  ];

  const measured = measureAndEnforceCouncilPolicy(rawOptions, {
    ...input,
    currency,
  });

  return {
    aiEnhanced: false,
    crossProviderUsed: false,
    fallbackNotice,
    generatedAt: new Date().toISOString(),
    currency,
    models: {
      strategist: t.councilFallbackModelStrategist,
      critic: t.councilFallbackModelCritic,
      criticProvider: "deterministic",
    },
    round1Strategist: {
      thesis: formatTemplate(t.councilFallbackRound1Thesis, {
        city: input.city,
        radiusKm: input.radiusKm,
        avgGapPct: input.avgGapPct,
        count: topTargets.length,
      }),
      campaignAngle: formatTemplate(t.councilFallbackRound1Campaign, {
        towns: secondaryTowns,
      }),
      priceMoves,
    },
    round2Critic: {
      verdict: "revise",
      riskScore: 58,
      objections: [
        formatTemplate(t.councilFallbackCriticObj1, {
          pain: topPain || t.councilFallbackCriticDefaultPain,
        }),
        t.councilFallbackCriticObj2,
      ],
      counterProposals: [
        formatTemplate(t.councilFallbackCriticCounter1, {
          radiusKm: input.radiusKm,
        }),
        addOnCounterProposal,
      ],
    },
    round3Synthesis: {
      summaryForHuman: formatTemplate(t.councilFallbackRound3Summary, {
        reason: sensitivityReason,
        humanSuffix,
      }),
      options: measured.options,
    },
    policyMeasurement: measured.policyMeasurement,
  };
}

export function normalizeSynthesisOption(
  raw: RawSynthesisOption | undefined,
  fallback: CouncilDecisionOption,
  forcedId: "safe" | "margin",
  locale?: Locale,
  currencyOverride?: DisplayCurrency,
): CouncilDecisionOption {
  if (!raw || !raw.summary) return fallback;
  const resolved = resolveLocale(locale);
  const { currency } = getLocaleCurrencyConfig(resolved, currencyOverride);
  const cleanText = (value: string) =>
    currency !== "PLN" ? stripForeignPlnSuffix(value) : value.trim();

  const adj = (raw.priceAdjustments ?? [])
    .filter(
      (a) =>
        a.serviceKey &&
        Number.isFinite(Number(a.currentPricePln)) &&
        Number.isFinite(Number(a.finalPricePln)) &&
        Number(a.finalPricePln) > 0,
    )
    .slice(0, 4)
    .map((a) => ({
      serviceKey: String(a.serviceKey),
      label: String(a.label || a.serviceKey).slice(0, 75),
      currentPricePln: Math.round(Number(a.currentPricePln)),
      finalPricePln: Math.round(Number(a.finalPricePln)),
    }));
  const items = (raw.actionItems ?? [])
    .map((s) => cleanText(String(s)))
    .filter(Boolean)
    .slice(0, 4);
  return {
    id: forcedId,
    title: cleanText(String(raw.title || fallback.title)).slice(0, 80),
    summary: cleanText(String(raw.summary)).slice(0, 260),
    priceAdjustments: adj.length > 0 ? adj : fallback.priceAdjustments,
    actionItems: items.length > 0 ? items : fallback.actionItems,
  };
}

export function buildRound3FallbackOptions(
  priceMoves: CouncilPriceMove[],
  fallbackBaseline: CouncilDebateResult,
  locale: Locale,
): {
  fallbackSafeOption: CouncilDecisionOption;
  fallbackMarginOption: CouncilDecisionOption;
} {
  const t = translations[resolveLocale(locale)];
  const round1MarginAdjustments: CouncilPriceAdjustment[] = priceMoves.map(
    (m) => ({
      serviceKey: m.serviceKey,
      label: m.label,
      currentPricePln: m.currentPricePln,
      finalPricePln: m.proposedPricePln,
    }),
  );

  const round1SafeAdjustments: CouncilPriceAdjustment[] = priceMoves.map(
    (m) => ({
      serviceKey: m.serviceKey,
      label: m.label,
      currentPricePln: m.currentPricePln,
      finalPricePln:
        m.proposedPricePln > m.currentPricePln
          ? Math.round(
              m.currentPricePln +
                (m.proposedPricePln - m.currentPricePln) * 0.55,
            )
          : m.proposedPricePln,
    }),
  );

  const fallbackSafeOption: CouncilDecisionOption =
    round1SafeAdjustments.length > 0
      ? {
          ...fallbackBaseline.round3Synthesis.options[0],
          priceAdjustments: round1SafeAdjustments,
        }
      : fallbackBaseline.round3Synthesis.options[0];

  const fallbackMarginOption: CouncilDecisionOption =
    round1MarginAdjustments.length > 0
      ? {
          ...fallbackBaseline.round3Synthesis.options[1],
          priceAdjustments: round1MarginAdjustments,
          actionItems: [
            formatTemplate(t.councilFallbackMarginAction1, {
              services: priceMoves.map((m) => m.label).join(", "),
            }),
            ...fallbackBaseline.round3Synthesis.options[1].actionItems.slice(1),
          ],
        }
      : fallbackBaseline.round3Synthesis.options[1];

  return { fallbackSafeOption, fallbackMarginOption };
}
