import { ThinkingLevel } from "@google/genai";
import { formatPrice, getLocaleCurrencyConfig } from "../../lib/currency";
import { formatTemplate, resolveLocale, translations } from "../../locales";
import {
  GEMINI_TEXT_MODEL,
  getGeminiClient,
  parseJsonSafe,
} from "./gemini-client";
import {
  buildCompactMarketBrief,
  buildGroundedFallbackCouncil,
  buildRound3FallbackOptions,
  clampPriceMoves,
  normalizeSynthesisOption,
  stripForeignPlnSuffix,
} from "./council/fallback-and-normalizers";
import {
  callOpenAiCompatibleJson,
  CRITIC_RESPONSE_SCHEMA,
  formatExternalModelLabel,
  getSecondaryProvider,
  isQuotaError,
  isTransientGeminiFailure,
  STRATEGIST_RESPONSE_SCHEMA,
  SYNTHESIS_RESPONSE_SCHEMA,
} from "./council/providers";
import {
  GEMINI_ROUND_TIMEOUT_MS,
  type CouncilDebateResult,
  type CouncilDecisionOption,
  type CouncilRequestInput,
  type RawCriticPayload,
  type RawStrategistPayload,
  type RawSynthesisPayload,
} from "./council/types";

export type {
  CouncilCompetitorInput,
  CouncilDebateResult,
  CouncilDecisionOption,
  CouncilPainPointInput,
  CouncilPriceAdjustment,
  CouncilPriceMove,
  CouncilRequestInput,
  CouncilServiceInput,
} from "./council/types";

export async function runAiCouncil(
  input: CouncilRequestInput,
): Promise<CouncilDebateResult> {
  const ai = getGeminiClient();
  const secondary = getSecondaryProvider();
  const locale = resolveLocale(input.locale);
  const t = translations[locale];
  const currencyCfg = getLocaleCurrencyConfig(locale);
  const isForeignCurrency = currencyCfg.currency !== "PLN";

  let languageLabel = locale.toUpperCase();
  try {
    languageLabel =
      new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ||
      languageLabel;
  } catch {
    // Keep uppercase locale code fallback
  }

  const sampleTarget = formatPrice(70 * currencyCfg.plnPerUnit, locale);
  const currencyRule = isForeignCurrency
    ? ` DISPLAY CURRENCY IS STRICTLY ${currencyCfg.currency}. Cite prices ONLY in ${currencyCfg.currency} in every text field — NEVER write 'PLN', 'zł', or add parenthetical base-unit conversions. For JSON numeric fields (currentPricePln, proposedPricePln, finalPricePln), always output exact integer targetPrice * ${currencyCfg.plnPerUnit} (e.g., ${sampleTarget} -> ${70 * currencyCfg.plnPerUnit}) matching baseUnits.`
    : "";

  const cleanProse = (value: string) =>
    isForeignCurrency ? stripForeignPlnSuffix(value) : value.trim();

  const normalizedInput: CouncilRequestInput = { ...input, locale };
  const brief = buildCompactMarketBrief(normalizedInput);

  if (!ai && !secondary) {
    return buildGroundedFallbackCouncil(normalizedInput, t.councilNoKeyNotice);
  }

  let strategistData: RawStrategistPayload | null = null;
  let strategistModelLabel = `Gemini (${GEMINI_TEXT_MODEL})`;
  let strategistUsedSecondaryModel: string | null = null;
  let geminiUnavailable = false;
  let geminiQuotaExhausted = false;

  const strategistSystem =
    `You are Agent 1 (Pricing & Geo Strategist) in an executive multi-agent council. ` +
    `Propose profitable, realistic pricing moves and a local expansion angle based ONLY on the provided numbers. ` +
    `Strictly obey any "Human Operator Constraint" and "Lessons Learned". Write all text in ${languageLabel}.${currencyRule}`;

  try {
    if (ai) {
      const res1 = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: `Analyze this live local market snapshot and return Round 1 JSON:\n\n${brief}`,
        config: {
          abortSignal: AbortSignal.timeout(GEMINI_ROUND_TIMEOUT_MS),
          httpOptions: {
            timeout: GEMINI_ROUND_TIMEOUT_MS,
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: strategistSystem,
          responseMimeType: "application/json",
          responseSchema: STRATEGIST_RESPONSE_SCHEMA,
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
      geminiUnavailable = true;
    } else if (isTransientGeminiFailure(err)) {
      geminiUnavailable = true;
      console.warn(
        "[/api/council] Gemini Strategist unavailable/timed out:",
        err,
      );
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
      normalizedInput,
      t.councilUnavailableNotice,
    );
  }

  const cleanMoves = clampPriceMoves(
    strategistData.priceMoves ?? [],
    normalizedInput.services,
  ).map((move) => ({
    ...move,
    rationale: cleanProse(move.rationale),
  }));
  const round1 = {
    thesis: cleanProse(strategistData.thesis),
    campaignAngle: cleanProse(String(strategistData.campaignAngle ?? "")),
    priceMoves: cleanMoves,
  };

  const round1ForAudit = isForeignCurrency
    ? {
        thesis: round1.thesis,
        campaignAngle: round1.campaignAngle,
        priceMoves: round1.priceMoves.map((m) => ({
          serviceKey: m.serviceKey,
          label: m.label,
          currentPrice: formatPrice(m.currentPricePln, locale),
          proposedPrice: formatPrice(m.proposedPricePln, locale),
          currentUnits: m.currentPricePln,
          proposedUnits: m.proposedPricePln,
          rationale: m.rationale,
        })),
      }
    : round1;

  let criticData: RawCriticPayload | null = null;
  let criticLabel = "";
  let criticProvider: "groq" | "openai" | "gemini-isolated" | "deterministic" =
    "gemini-isolated";
  let crossProviderUsed = false;

  const criticSystem =
    `You are Agent 2 (Independent Risk Auditor & Devil's Advocate) running in a separate session. ` +
    `Do NOT blindly agree with Agent 1. Challenge overly aggressive price hikes, hidden travel-fee risks, conversion drops against top-rated Google Maps rivals, and compliance with customer complaints & operator constraints. ` +
    `Do NOT invent customer review statistics (%) that are not present in LIVE MARKET CONTEXT. Write all text in ${languageLabel}.${currencyRule} Return valid JSON.`;

  const criticPrompt = [
    `LIVE MARKET CONTEXT:\n${brief}`,
    `\nAGENT 1 PROPOSAL TO AUDIT:\n${JSON.stringify(round1ForAudit)}`,
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

  if (!criticData && ai && !geminiUnavailable) {
    try {
      const res2 = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: criticPrompt,
        config: {
          abortSignal: AbortSignal.timeout(GEMINI_ROUND_TIMEOUT_MS),
          httpOptions: {
            timeout: GEMINI_ROUND_TIMEOUT_MS,
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: criticSystem,
          responseMimeType: "application/json",
          responseSchema: CRITIC_RESPONSE_SCHEMA,
        },
      });
      criticData = parseJsonSafe<RawCriticPayload | null>(res2.text, null);
      criticLabel = `Gemini (${GEMINI_TEXT_MODEL}) · Fresh Session`;
      criticProvider = "gemini-isolated";
    } catch (err) {
      if (isQuotaError(err)) {
        geminiQuotaExhausted = true;
        geminiUnavailable = true;
      } else if (isTransientGeminiFailure(err)) {
        geminiUnavailable = true;
        console.warn(
          "[/api/council] Isolated Gemini critic unavailable/timed out:",
          err,
        );
      } else {
        console.error("[/api/council] Isolated Gemini critic error:", err);
      }
    }
  }

  const fallbackBaseline = buildGroundedFallbackCouncil(normalizedInput);
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
          objections: criticData.objections
            .slice(0, 3)
            .map((obj) => cleanProse(String(obj))),
          counterProposals: (criticData.counterProposals ?? [])
            .slice(0, 3)
            .map((cp) => cleanProse(String(cp))),
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
    `Write all text in ${languageLabel}.${currencyRule} Return valid JSON.`;

  const synthesisPrompt = [
    `ROUND 1 STRATEGIST:\n${JSON.stringify(round1ForAudit)}`,
    `ROUND 2 CRITIC:\n${JSON.stringify(round2)}`,
    normalizedInput.humanNote?.trim()
      ? `HUMAN CONSTRAINT: ${normalizedInput.humanNote.trim()}`
      : "",
    `Return strict JSON with keys: summaryForHuman (2 crisp sentences), options (array of 2 objects: id "safe" and id "margin", each with title, summary, priceAdjustments [{serviceKey,label,currentPricePln,finalPricePln}], actionItems [3 concise strings for Jira]).`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (ai && !geminiUnavailable) {
    try {
      const res3 = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: synthesisPrompt,
        config: {
          abortSignal: AbortSignal.timeout(GEMINI_ROUND_TIMEOUT_MS),
          httpOptions: {
            timeout: GEMINI_ROUND_TIMEOUT_MS,
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: synthesisSystem,
          responseMimeType: "application/json",
          responseSchema: SYNTHESIS_RESPONSE_SCHEMA,
        },
      });
      synthesisData = parseJsonSafe<RawSynthesisPayload | null>(
        res3.text,
        null,
      );
    } catch (err) {
      if (isQuotaError(err)) {
        geminiQuotaExhausted = true;
        geminiUnavailable = true;
      } else if (isTransientGeminiFailure(err)) {
        geminiUnavailable = true;
        console.warn(
          "[/api/council] Gemini Synthesis unavailable/timed out:",
          err,
        );
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

  const { fallbackSafeOption, fallbackMarginOption } =
    buildRound3FallbackOptions(round1.priceMoves, fallbackBaseline, locale);

  const rawSafe =
    synthesisData?.options?.find((o) => o.id === "safe") ??
    synthesisData?.options?.[0];
  const rawMargin =
    synthesisData?.options?.find((o) => o.id === "margin") ??
    synthesisData?.options?.[1];

  const finalOptions: [CouncilDecisionOption, CouncilDecisionOption] = [
    normalizeSynthesisOption(rawSafe, fallbackSafeOption, "safe", locale),
    normalizeSynthesisOption(rawMargin, fallbackMarginOption, "margin", locale),
  ];

  const fallbackNotice =
    geminiQuotaExhausted && strategistUsedSecondaryModel
      ? formatTemplate(t.councilQuotaFallbackNotice, {
          strategist: strategistModelLabel,
          critic: criticLabel,
        })
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
      summaryForHuman: synthesisData?.summaryForHuman?.trim()
        ? cleanProse(synthesisData.summaryForHuman)
        : fallbackBaseline.round3Synthesis.summaryForHuman,
      options: finalOptions,
    },
  };
}
