import { Type } from "@google/genai";
import { parseJsonSafe } from "../gemini-client";
import {
  EXTERNAL_MODEL_TIMEOUT_MS,
  EXTERNAL_ROUND_BUDGET_MS,
  type ExternalProviderConfig,
} from "./types";

const GROQ_DEFAULT_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
] as const;

export const STRATEGIST_RESPONSE_SCHEMA = {
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
};

export const CRITIC_RESPONSE_SCHEMA = {
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
  required: ["verdict", "riskScore", "objections", "counterProposals"],
};

export const SYNTHESIS_RESPONSE_SCHEMA = {
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
        required: ["id", "title", "summary", "priceAdjustments", "actionItems"],
      },
    },
  },
  required: ["summaryForHuman", "options"],
};

export function getSecondaryProvider(): ExternalProviderConfig | null {
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

export function formatExternalModelLabel(
  provider: "groq" | "openai",
  model: string,
): string {
  return provider === "groq" ? `Groq · ${model}` : `OpenAI · ${model}`;
}

export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.toLowerCase().includes("quota")
  );
}

export function isTransientGeminiFailure(err: unknown): boolean {
  if (isQuotaError(err)) return true;
  if (err instanceof DOMException) {
    return err.name === "TimeoutError" || err.name === "AbortError";
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.toLowerCase().includes("timeout") ||
    msg.toLowerCase().includes("aborted")
  );
}

export function stripThinkBlocks(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export async function callOpenAiCompatibleJson<T>(
  cfg: ExternalProviderConfig,
  systemPrompt: string,
  userPrompt: string,
  orderedModels?: string[],
): Promise<{ data: T | null; usedModel: string }> {
  const modelsToTry =
    orderedModels && orderedModels.length > 0 ? orderedModels : cfg.models;
  const deadline = Date.now() + EXTERNAL_ROUND_BUDGET_MS;
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 1_500) break;

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
        signal: AbortSignal.timeout(
          Math.min(EXTERNAL_MODEL_TIMEOUT_MS, remainingMs),
        ),
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
