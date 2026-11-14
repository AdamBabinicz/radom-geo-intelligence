import { ThinkingLevel, Type } from "@google/genai";
import type { IndustryId } from "../../config/industries";
import {
  GEMINI_TEXT_MODEL,
  getGeminiClient,
  parseJsonSafe,
} from "./gemini-client";

export interface CouncilServiceInput {
  serviceKey: string;
  label: string;
  unitType: string;
  ourPricePln: number;
  localPricePln: number;
}

export interface CouncilCompetitorInput {
  name: string;
  rating?: number;
  reviewCount?: number;
  priceSummary: string;
  travelFeeNote?: string;
}

export interface CouncilPainPointInput {
  label: string;
  score: number;
  evidence?: string;
}

export interface CouncilRequestInput {
  city: string;
  industryId: IndustryId;
  radiusKm: number;
  locale: "pl" | "en";
  avgGapPct: number;
  townsInRadius: string[];
  services: CouncilServiceInput[];
  competitors: CouncilCompetitorInput[];
  painPoints: CouncilPainPointInput[];
  humanNote?: string;
  lessonsLearned?: string[];
}

export interface CouncilPriceMove {
  serviceKey: string;
  label: string;
  currentPricePln: number;
  proposedPricePln: number;
  rationale: string;
}

export interface CouncilPriceAdjustment {
  serviceKey: string;
  label: string;
  currentPricePln: number;
  finalPricePln: number;
}

export interface CouncilDecisionOption {
  id: "safe" | "margin";
  title: string;
  summary: string;
  priceAdjustments: CouncilPriceAdjustment[];
  actionItems: string[];
}

export interface CouncilDebateResult {
  aiEnhanced: boolean;
  crossProviderUsed: boolean;
  fallbackNotice?: string;
  generatedAt: string;
  models: {
    strategist: string;
    critic: string;
    criticProvider: "groq" | "openai" | "gemini-isolated" | "deterministic";
  };
  round1Strategist: {
    thesis: string;
    campaignAngle: string;
    priceMoves: CouncilPriceMove[];
  };
  round2Critic: {
    verdict: "challenge" | "revise" | "caution";
    riskScore: number;
    objections: string[];
    counterProposals: string[];
  };
  round3Synthesis: {
    summaryForHuman: string;
    options: [CouncilDecisionOption, CouncilDecisionOption];
  };
}

interface ExternalProviderConfig {
  provider: "groq" | "openai";
  endpoint: string;
  apiKey: string;
  models: string[];
}

const GROQ_DEFAULT_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
] as const;

function getSecondaryProvider(): ExternalProviderConfig | null {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const preferred = process.env.GROQ_TEXT_MODEL?.trim();
    const models = Array.from(
      new Set(
        [preferred, ...GROQ_DEFAULT_MODELS].filter((m): m is string =>
          Boolean(m && m.length > 0),
        ),
      ),
    );
    return {
      provider: "groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: groqKey,
      models,
    };
  }
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const preferred = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-mini";
    return {
      provider: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: openaiKey,
      models: [preferred],
    };
  }
  return null;
}

function formatExternalModelLabel(
  provider: "groq" | "openai",
  model: string,
): string {
  return provider === "groq" ? `Groq · ${model}` : `OpenAI · ${model}`;
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.toLowerCase().includes("quota")
  );
}

function stripThinkBlocks(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function callOpenAiCompatibleJson<T>(
  cfg: ExternalProviderConfig,
  systemPrompt: string,
  userPrompt: string,
  orderedModels?: string[],
): Promise<{ data: T | null; usedModel: string }> {
  const modelsToTry =
    orderedModels && orderedModels.length > 0 ? orderedModels : cfg.models;
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 1800,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(18000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `${cfg.provider} (${model}) HTTP ${res.status}: ${errText.slice(0, 180)}`,
        );
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent = json.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error(`${cfg.provider} (${model}) returned empty content`);
      }

      const cleaned = stripThinkBlocks(rawContent);
      const parsed = parseJsonSafe<T | null>(cleaned, null);
      if (!parsed) {
        throw new Error(`${cfg.provider} (${model}) returned unparseable JSON`);
      }

      return { data: parsed, usedModel: model };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[/api/council] Model ${model} failed, trying fallback if available:`,
        lastError.message,
      );
    }
  }

  throw lastError ?? new Error(`${cfg.provider} request failed`);
}

function buildCompactMarketBrief(input: CouncilRequestInput): string {
  const servicesLines = input.services
    .slice(0, 12)
    .map((s) => {
      const gap =
        s.localPricePln > 0
          ? `${Math.round(((s.ourPricePln - s.localPricePln) / s.localPricePln) * 100)}%`
          : "n/a";
      return `- [${s.serviceKey}] ${s.label}: our=${s.ourPricePln} PLN, localAvg=${s.localPricePln > 0 ? `${s.localPricePln} PLN` : "none"} (gap ${gap})`;
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
    `City: ${input.city} | Industry: ${input.industryId} | Radius: ${input.radiusKm} km | Avg Market Gap: ${input.avgGapPct}%`,
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

function clampPriceMoves(
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

function buildGroundedFallbackCouncil(
  input: CouncilRequestInput,
  fallbackNotice?: string,
): CouncilDebateResult {
  const isPl = input.locale === "pl";
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
          ? `Średnia w ${input.city} to ${s.localPricePln} zł — bezpieczne domknięcie luki cenowej.`
          : `Korekta marżowa +8% w promieniu ${input.radiusKm} km.`
        : s.localPricePln > 0
          ? `${input.city} avg is ${s.localPricePln} PLN — closing part of the market gap.`
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
        ? `W ${input.city} (${input.radiusKm} km) średnia różnica cen wynosi ${input.avgGapPct}%. Podniesienie ${topTargets.length} najtańszych usług zmniejszy lukę bez utraty przewagi nad konkurentami.`
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
        isPl
          ? `Utrzymaj cenę wejściową głównego pakietu, a marżę buduj na usługach dodatkowych (impregnacja, pufa, dosuszanie).`
          : `Protect flagship entry price while monetizing add-ons (fabric protection, drying, extra pieces).`,
      ],
    },
    round3Synthesis: {
      summaryForHuman: isPl
        ? `Strateg zaproponował domknięcie 65% luki cenowej, ale Krytyk wstrzymał agresywny skok ze względu na wrażliwość klientów na ukryte opłaty.${humanSuffix} Wybierz wariant do publikacji w Confluence i Jira.`
        : `Strategist proposed closing 65% of the price gap, but Critic flagged churn risk around pricing transparency.${humanSuffix} Select an option to ship to Confluence & Jira.`,
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
                `Zaktualizuj publiczny cennik WWW dla ${input.city} o jasne stawki końcowe i darmowy dojazd w strefie ${input.radiusKm} km`,
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
                `Wdróż wyższe stawki bazowe dla ${topTargets.map((t) => t.label).join(", ")}`,
                `Przygotuj pakiety cross-sell (impregnacja / dosuszanie) dla zleceń powyżej 200 zł`,
                `Skieruj reklamy na dzielnice o najwyższych ocenach konkurencji w Google Maps`,
              ]
            : [
                `Roll out higher base rates for ${topTargets.map((t) => t.label).join(", ")}`,
                `Bundle add-ons (fabric protection / drying) for orders above 200 PLN`,
                `Target high-intent suburbs around ${secondaryTowns}`,
              ],
        },
      ],
    },
  };
}

interface RawStrategistPayload {
  thesis?: string;
  campaignAngle?: string;
  priceMoves?: Array<{
    serviceKey?: string;
    label?: string;
    currentPricePln?: number;
    proposedPricePln?: number;
    rationale?: string;
  }>;
}

interface RawCriticPayload {
  verdict?: string;
  riskScore?: number;
  objections?: string[];
  counterProposals?: string[];
}

interface RawSynthesisOption {
  id?: string;
  title?: string;
  summary?: string;
  priceAdjustments?: Array<{
    serviceKey?: string;
    label?: string;
    currentPricePln?: number;
    finalPricePln?: number;
  }>;
  actionItems?: string[];
}

interface RawSynthesisPayload {
  summaryForHuman?: string;
  options?: RawSynthesisOption[];
}

export async function runAiCouncil(
  input: CouncilRequestInput,
): Promise<CouncilDebateResult> {
  const ai = getGeminiClient();
  const secondary = getSecondaryProvider();
  const languageLabel = input.locale === "pl" ? "Polish" : "English";
  const brief = buildCompactMarketBrief(input);

  if (!ai && !secondary) {
    return buildGroundedFallbackCouncil(
      input,
      input.locale === "pl"
        ? "Brak klucza AI (GEMINI_API_KEY / GROQ_API_KEY) — użyto narady opartej bezpośrednio o dane z rynku."
        : "No AI API key configured — using deterministic council grounded in your live metrics.",
    );
  }

  let strategistData: RawStrategistPayload | null = null;
  let strategistModelLabel = `Gemini (${GEMINI_TEXT_MODEL})`;
  let strategistUsedSecondaryModel: string | null = null;
  let geminiQuotaExhausted = false;

  const strategistSystem =
    `You are Agent 1 (Pricing & Geo Strategist) in an executive multi-agent council. ` +
    `Propose profitable, realistic pricing moves and a local expansion angle based ONLY on the provided numbers. ` +
    `Strictly obey any "Human Operator Constraint" and "Lessons Learned". Write all text in ${languageLabel}.`;

  try {
    if (ai) {
      const res1 = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: `Analyze this live local market snapshot and return Round 1 JSON:\n\n${brief}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: strategistSystem,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              thesis: { type: Type.STRING },
              campaignAngle: { type: Type.STRING },
              priceMoves: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    serviceKey: { type: Type.STRING },
                    label: { type: Type.STRING },
                    currentPricePln: { type: Type.NUMBER },
                    proposedPricePln: { type: Type.NUMBER },
                    rationale: { type: Type.STRING },
                  },
                  required: [
                    "serviceKey",
                    "label",
                    "currentPricePln",
                    "proposedPricePln",
                    "rationale",
                  ],
                },
              },
            },
            required: ["thesis", "campaignAngle", "priceMoves"],
          },
        },
      });
      strategistData = parseJsonSafe<RawStrategistPayload | null>(
        res1.text,
        null,
      );
    }
  } catch (err) {
    if (isQuotaError(err)) {
      geminiQuotaExhausted = true;
    } else {
      console.error("[/api/council] Gemini Strategist error:", err);
    }
  }

  if ((!strategistData || !strategistData.thesis) && secondary) {
    try {
      const res = await callOpenAiCompatibleJson<RawStrategistPayload>(
        secondary,
        `${strategistSystem} Return strict JSON with keys: thesis (string), campaignAngle (string), priceMoves (array of {serviceKey, label, currentPricePln, proposedPricePln, rationale}).`,
        brief,
      );
      strategistData = res.data;
      strategistUsedSecondaryModel = res.usedModel;
      strategistModelLabel = formatExternalModelLabel(
        secondary.provider,
        res.usedModel,
      );
    } catch (secErr) {
      console.error("[/api/council] Secondary Strategist error:", secErr);
    }
  }

  if (!strategistData || !strategistData.thesis) {
    return buildGroundedFallbackCouncil(
      input,
      input.locale === "pl"
        ? "Limit zapytań AI (429) — wyświetlono naradę wyliczoną bezpośrednio z Twojego aktualnego cennika i firm z Google Maps."
        : "AI quota reached (429) — showing structured debate computed directly from your live pricing & competitor scan.",
    );
  }

  const cleanMoves = clampPriceMoves(
    strategistData.priceMoves ?? [],
    input.services,
  );
  const round1 = {
    thesis: strategistData.thesis.trim(),
    campaignAngle: String(strategistData.campaignAngle ?? "").trim(),
    priceMoves: cleanMoves,
  };

  let criticData: RawCriticPayload | null = null;
  let criticLabel = "";
  let criticProvider: "groq" | "openai" | "gemini-isolated" | "deterministic" =
    "gemini-isolated";
  let crossProviderUsed = false;

  const criticSystem =
    `You are Agent 2 (Independent Risk Auditor & Devil's Advocate) running in a separate session. ` +
    `Do NOT blindly agree with Agent 1. Challenge overly aggressive price hikes, hidden travel-fee risks, conversion drops against top-rated Google Maps rivals, and compliance with customer complaints & operator constraints. ` +
    `Write all text in ${languageLabel}. Return valid JSON.`;

  const criticPrompt = [
    `LIVE MARKET CONTEXT:\n${brief}`,
    `\nAGENT 1 PROPOSAL TO AUDIT:\n${JSON.stringify(round1)}`,
    `\nReturn strict JSON with keys: verdict ("challenge" | "revise" | "caution"), riskScore (integer 20..95), objections (2-3 sharp concrete strings), counterProposals (2-3 concrete mitigation strings).`,
  ].join("\n");

  if (secondary) {
    try {
      const criticModelOrder = strategistUsedSecondaryModel
        ? [
            ...secondary.models.filter(
              (m) => m !== strategistUsedSecondaryModel,
            ),
            strategistUsedSecondaryModel,
          ]
        : secondary.models;

      const res = await callOpenAiCompatibleJson<RawCriticPayload>(
        secondary,
        criticSystem,
        criticPrompt,
        criticModelOrder,
      );
      if (res.data && Array.isArray(res.data.objections)) {
        criticData = res.data;
        criticLabel = formatExternalModelLabel(
          secondary.provider,
          res.usedModel,
        );
        criticProvider = secondary.provider;
        crossProviderUsed =
          !strategistUsedSecondaryModel ||
          res.usedModel !== strategistUsedSecondaryModel;
      }
    } catch (err) {
      console.warn(
        "[/api/council] Cross-provider critic failed, falling back:",
        err,
      );
    }
  }

  if (!criticData && ai && !geminiQuotaExhausted) {
    try {
      const res2 = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: criticPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: criticSystem,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING },
              riskScore: { type: Type.INTEGER },
              objections: { type: Type.ARRAY, items: { type: Type.STRING } },
              counterProposals: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              "verdict",
              "riskScore",
              "objections",
              "counterProposals",
            ],
          },
        },
      });
      criticData = parseJsonSafe<RawCriticPayload | null>(res2.text, null);
      criticLabel = `Gemini (${GEMINI_TEXT_MODEL}) · Fresh Session`;
      criticProvider = "gemini-isolated";
    } catch (err) {
      if (isQuotaError(err)) {
        geminiQuotaExhausted = true;
      } else {
        console.error("[/api/council] Isolated Gemini critic error:", err);
      }
    }
  }

  const fallbackBaseline = buildGroundedFallbackCouncil(input);
  const rawVerdict = String(criticData?.verdict ?? "revise").toLowerCase();
  const verdict: "challenge" | "revise" | "caution" =
    rawVerdict === "challenge" || rawVerdict === "caution"
      ? rawVerdict
      : "revise";

  const round2 =
    criticData &&
    Array.isArray(criticData.objections) &&
    criticData.objections.length > 0
      ? {
          verdict,
          riskScore: Math.min(
            95,
            Math.max(20, Math.round(Number(criticData.riskScore) || 62)),
          ),
          objections: criticData.objections.slice(0, 3).map(String),
          counterProposals: (criticData.counterProposals ?? [])
            .slice(0, 3)
            .map(String),
        }
      : fallbackBaseline.round2Critic;

  if (!criticLabel) {
    criticLabel = fallbackBaseline.models.critic;
    criticProvider = "deterministic";
  }

  let synthesisData: RawSynthesisPayload | null = null;
  const synthesisSystem =
    `You are Agent 3 (Council Moderator) synthesizing Agent 1's proposal and Agent 2's critique for the Human Operator. ` +
    `Produce exactly two distinct executable options ("safe" and "margin") that respect the Human Operator Constraint and Lessons Learned. ` +
    `Write all text in ${languageLabel}. Return valid JSON.`;

  const synthesisPrompt = [
    `ROUND 1 STRATEGIST:\n${JSON.stringify(round1)}`,
    `ROUND 2 CRITIC:\n${JSON.stringify(round2)}`,
    input.humanNote?.trim()
      ? `HUMAN CONSTRAINT: ${input.humanNote.trim()}`
      : "",
    `Return strict JSON with keys: summaryForHuman (2 crisp sentences), options (array of 2 objects: id "safe" and id "margin", each with title, summary, priceAdjustments [{serviceKey,label,currentPricePln,finalPricePln}], actionItems [3 concise strings for Jira]).`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (ai && !geminiQuotaExhausted) {
    try {
      const res3 = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: synthesisPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: synthesisSystem,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summaryForHuman: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    priceAdjustments: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          serviceKey: { type: Type.STRING },
                          label: { type: Type.STRING },
                          currentPricePln: { type: Type.NUMBER },
                          finalPricePln: { type: Type.NUMBER },
                        },
                        required: [
                          "serviceKey",
                          "label",
                          "currentPricePln",
                          "finalPricePln",
                        ],
                      },
                    },
                    actionItems: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    "id",
                    "title",
                    "summary",
                    "priceAdjustments",
                    "actionItems",
                  ],
                },
              },
            },
            required: ["summaryForHuman", "options"],
          },
        },
      });
      synthesisData = parseJsonSafe<RawSynthesisPayload | null>(
        res3.text,
        null,
      );
    } catch (err) {
      if (isQuotaError(err)) {
        geminiQuotaExhausted = true;
      } else {
        console.error("[/api/council] Gemini Synthesis error:", err);
      }
    }
  }

  if (!synthesisData && secondary) {
    try {
      const res = await callOpenAiCompatibleJson<RawSynthesisPayload>(
        secondary,
        synthesisSystem,
        synthesisPrompt,
      );
      synthesisData = res.data;
    } catch (secErr) {
      console.error("[/api/council] Synthesis fallback error:", secErr);
    }
  }

  const normalizeOption = (
    raw: RawSynthesisOption | undefined,
    fallback: CouncilDecisionOption,
    forcedId: "safe" | "margin",
  ): CouncilDecisionOption => {
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
  };

  const rawSafe =
    synthesisData?.options?.find((o) => o.id === "safe") ??
    synthesisData?.options?.[0];
  const rawMargin =
    synthesisData?.options?.find((o) => o.id === "margin") ??
    synthesisData?.options?.[1];

  const finalOptions: [CouncilDecisionOption, CouncilDecisionOption] = [
    normalizeOption(
      rawSafe,
      fallbackBaseline.round3Synthesis.options[0],
      "safe",
    ),
    normalizeOption(
      rawMargin,
      fallbackBaseline.round3Synthesis.options[1],
      "margin",
    ),
  ];

  const fallbackNotice =
    geminiQuotaExhausted && strategistUsedSecondaryModel
      ? input.locale === "pl"
        ? `Limit Gemini API (429) — naradę na żywo przeprowadziły dwa niezależne modele AI (${strategistModelLabel} ↔ ${criticLabel}).`
        : `Gemini API quota reached (429) — live debate executed across two independent AI models (${strategistModelLabel} ↔ ${criticLabel}).`
      : undefined;

  return {
    aiEnhanced: true,
    crossProviderUsed,
    fallbackNotice,
    generatedAt: new Date().toISOString(),
    models: {
      strategist: strategistModelLabel,
      critic: criticLabel,
      criticProvider,
    },
    round1Strategist: round1,
    round2Critic: round2,
    round3Synthesis: {
      summaryForHuman:
        synthesisData?.summaryForHuman?.trim() ||
        fallbackBaseline.round3Synthesis.summaryForHuman,
      options: finalOptions,
    },
  };
}
