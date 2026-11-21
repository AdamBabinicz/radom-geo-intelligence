import type {
  CouncilDebateResult,
  CouncilDecisionOption,
  CouncilPriceAdjustment,
  CouncilPriceMove,
  CouncilRequestInput,
  CouncilServiceInput,
  RawSynthesisOption,
} from "./types";

export function buildCompactMarketBrief(input: CouncilRequestInput): string {
  const resolvedIndustry = input.industryLabel?.trim() || input.industryId;
  const servicesLines = input.services
    .slice(0, 12)
    .map((s) => {
      const gap =
        s.localPricePln > 0
          ? `${Math.round(((s.ourPricePln - s.localPricePln) / s.localPricePln) * 100)}%`
          : "n/a";
      const enHint =
        input.locale === "en"
          ? ` (~$${Math.round(s.ourPricePln / 4)} USD vs ~$${
              s.localPricePln > 0 ? Math.round(s.localPricePln / 4) : 0
            } USD)`
          : "";
      return `- [${s.serviceKey}] ${s.label}: our=${s.ourPricePln} PLN, localAvg=${s.localPricePln > 0 ? `${s.localPricePln} PLN` : "none"} (gap ${gap})${enHint}`;
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

export function buildGroundedFallbackCouncil(
  input: CouncilRequestInput,
  fallbackNotice?: string,
): CouncilDebateResult {
  const isPl = input.locale === "pl";
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
      rationale: isPl
        ? s.localPricePln > 0
          ? `Średnia w mieście ${input.city} to ${s.localPricePln} zł — bezpieczne domknięcie luki cenowej.`
          : `Korekta marżowa +8% w promieniu ${input.radiusKm} km.`
        : s.localPricePln > 0
          ? `${input.city} avg is ~$${Math.round(s.localPricePln / 4)} — closing part of the market gap.`
          : `Modest +8% margin adjustment inside ${input.radiusKm} km zone.`,
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
    ? isPl
      ? ` Uwzględniono zasadę operatora: "${input.humanNote.trim()}".`
      : ` Honored operator rule: "${input.humanNote.trim()}".`
    : "";

  const addOnCounterProposal = isCustomOrNonUpholstery
    ? isPl
      ? "Utrzymaj cenę wejściową głównego pakietu, a marżę buduj na usługach dodatkowych oraz pakietach premium."
      : "Protect flagship entry pricing while monetizing add-on services and priority packages."
    : isPl
      ? "Utrzymaj cenę wejściową głównego pakietu, a marżę buduj na usługach dodatkowych (impregnacja, pufa, dosuszanie)."
      : "Protect flagship entry price while monetizing add-ons (fabric protection, drying, extra pieces).";

  const marginActionMiddle = isCustomOrNonUpholstery
    ? isPl
      ? "Przygotuj pakiety cross-sell (usługi dodatkowe i gwarancja terminu) dla większych zleceń"
      : "Bundle high-margin add-on services or priority scheduling for larger bookings"
    : isPl
      ? "Przygotuj pakiety cross-sell (impregnacja / dosuszanie) dla zleceń powyżej 200 zł"
      : "Bundle add-ons (fabric protection / drying) for higher-value bookings";

  const sensitivityReasonPl = topPain
    ? `ryzyka wokół: ${topPain}`
    : "wrażliwość cenową lokalnego rynku";
  const sensitivityReasonEn = topPain
    ? `customer friction around ${topPain}`
    : "local market price sensitivity";

  return {
    aiEnhanced: false,
    crossProviderUsed: false,
    fallbackNotice,
    generatedAt: new Date().toISOString(),
    models: {
      strategist: isPl
        ? "Silnik Regułowy (Dane Live)"
        : "Deterministic Engine (Live Data)",
      critic: isPl ? "Audytor Ryzyka (Dane Live)" : "Risk Auditor (Live Data)",
      criticProvider: "deterministic",
    },
    round1Strategist: {
      thesis: isPl
        ? `W strefie ${input.city} (${input.radiusKm} km) średnia różnica cen wynosi ${input.avgGapPct}%. Podniesienie ${topTargets.length} najtańszych usług zmniejszy lukę bez utraty przewagi nad konkurentami.`
        : `Across ${input.city} (${input.radiusKm} km), our price gap averages ${input.avgGapPct}%. Lifting ${topTargets.length} underpriced services boosts margin while staying below local rivals.`,
      campaignAngle: isPl
        ? `Kampania "Pełny cennik z góry — zero dopłat" dla miejscowości: ${secondaryTowns}.`
        : `"Upfront transparent pricing — zero hidden fees" campaign targeting ${secondaryTowns}.`,
      priceMoves,
    },
    round2Critic: {
      verdict: "revise",
      riskScore: 58,
      objections: [
        isPl
          ? `Główna skarga klientów (${topPain || "brak jawnych cen"}) oznacza, że podwyżka bez podkreślenia ceny końcowej obniży konwersję.`
          : `Top customer complaint (${topPain || "opaque pricing"}) warns against raising prices without clearer upfront quotes.`,
        isPl
          ? `Jednorazowy skok o >15% przy wysokiej konkurencji w Google Maps może wypchnąć część zapytań do firm z oceną 4.9★.`
          : `Abrupt >15% hikes risk losing price-sensitive leads to 4.9★ Google Maps competitors.`,
      ],
      counterProposals: [
        isPl
          ? `Rozbij podwyżkę na łagodniejszy krok (+35% luki zamiast +65%) i wyeksponuj darmowy dojazd w promieniu ${input.radiusKm} km.`
          : `Phase increases to ~35% of the gap first and highlight free zone travel inside ${input.radiusKm} km.`,
        addOnCounterProposal,
      ],
    },
    round3Synthesis: {
      summaryForHuman: isPl
        ? `Strateg zaproponował domknięcie 65% luki cenowej, ale Krytyk wstrzymał agresywny skok ze względu na ${sensitivityReasonPl}.${humanSuffix} Wybierz wariant do publikacji w Confluence i Jira.`
        : `Strategist proposed closing 65% of the price gap, but Critic flagged churn risk around ${sensitivityReasonEn}.${humanSuffix} Select an option to ship to Confluence & Jira.`,
      options: [
        {
          id: "safe",
          title: isPl
            ? "Wariant A · Zaufanie i Przejrzystość"
            : "Option A · Trust & Transparency",
          summary: isPl
            ? "Łagodna korekta cen (+35% luki), publikacja pełnego cennika i gwarancja braku ukrytych kosztów."
            : "Gentle price lift (+35% of gap), public itemized rate card, and zero-hidden-fee guarantee.",
          priceAdjustments: safeAdjustments,
          actionItems: isPl
            ? [
                `Zaktualizuj publiczny cennik WWW dla miasta ${input.city} o jasne stawki końcowe i darmowy dojazd w strefie ${input.radiusKm} km`,
                `Uruchom kampanię "Cennik z góry" w ${secondaryTowns}`,
                `Dodaj kalkulator wyceny z dojazdem na górę strony głównej`,
              ]
            : [
                `Publish transparent rate card for ${input.city} with free travel inside ${input.radiusKm} km`,
                `Launch "Zero hidden fees" local campaign across ${secondaryTowns}`,
                `Feature instant zone quote calculator above the fold`,
              ],
        },
        {
          id: "margin",
          title: isPl
            ? "Wariant B · Maksymalizacja Marży"
            : "Option B · Margin Expansion",
          summary: isPl
            ? "Szybsze wyrównanie do 65% średniej lokalnej na usługach podstawowych + pakietowanie usług dodatkowych."
            : "Faster lift toward 65% of local average on core services plus high-margin add-on bundles.",
          priceAdjustments: marginAdjustments,
          actionItems: isPl
            ? [
                `Wdróż wyższe stawki bazowe dla: ${topTargets.map((t) => t.label).join(", ")}`,
                marginActionMiddle,
                `Skieruj reklamy na dzielnice o najwyższych ocenach konkurencji w Google Maps`,
              ]
            : [
                `Roll out higher base rates for: ${topTargets.map((t) => t.label).join(", ")}`,
                marginActionMiddle,
                `Target high-intent suburbs around ${secondaryTowns}`,
              ],
        },
      ],
    },
  };
}

export function normalizeSynthesisOption(
  raw: RawSynthesisOption | undefined,
  fallback: CouncilDecisionOption,
  forcedId: "safe" | "margin",
): CouncilDecisionOption {
  if (!raw || !raw.summary) return fallback;
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
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 4);
  return {
    id: forcedId,
    title: String(raw.title || fallback.title).slice(0, 80),
    summary: String(raw.summary).slice(0, 260),
    priceAdjustments: adj.length > 0 ? adj : fallback.priceAdjustments,
    actionItems: items.length > 0 ? items : fallback.actionItems,
  };
}

export function buildRound3FallbackOptions(
  priceMoves: CouncilPriceMove[],
  fallbackBaseline: CouncilDebateResult,
  locale: "pl" | "en",
): {
  fallbackSafeOption: CouncilDecisionOption;
  fallbackMarginOption: CouncilDecisionOption;
} {
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
            locale === "pl"
              ? `Wdróż wyższe stawki bazowe dla: ${priceMoves.map((m) => m.label).join(", ")}`
              : `Roll out higher base rates for: ${priceMoves.map((m) => m.label).join(", ")}`,
            ...fallbackBaseline.round3Synthesis.options[1].actionItems.slice(1),
          ],
        }
      : fallbackBaseline.round3Synthesis.options[1];

  return { fallbackSafeOption, fallbackMarginOption };
}
