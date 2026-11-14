import { NextRequest, NextResponse } from "next/server";
import {
  runAiCouncil,
  type CouncilCompetitorInput,
  type CouncilDebateResult,
  type CouncilPainPointInput,
  type CouncilRequestInput,
  type CouncilServiceInput,
} from "@/src/backend/ai/council-engine";
import { INDUSTRY_TEMPLATES, type IndustryId } from "@/src/config/industries";

export const runtime = "nodejs";

const COUNCIL_CACHE_TTL_MS = 5 * 60 * 1000;
const councilCache = new Map<
  string,
  { expiresAt: number; result: CouncilDebateResult }
>();

function parseIndustry(raw: unknown): IndustryId {
  if (typeof raw === "string" && raw in INDUSTRY_TEMPLATES) {
    return raw as IndustryId;
  }
  return "upholstery";
}

function sanitizeServices(raw: unknown): CouncilServiceInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CouncilServiceInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const serviceKey =
      typeof obj.serviceKey === "string" ? obj.serviceKey.trim() : "";
    const ourPricePln = Number(obj.ourPricePln);
    const localPricePln = Number(obj.localPricePln ?? 0);
    if (!serviceKey || !Number.isFinite(ourPricePln) || ourPricePln <= 0) {
      continue;
    }
    out.push({
      serviceKey: serviceKey.slice(0, 64),
      label: String(obj.label || serviceKey).slice(0, 80),
      unitType: String(obj.unitType || "fixed").slice(0, 16),
      ourPricePln: Math.round(ourPricePln),
      localPricePln:
        Number.isFinite(localPricePln) && localPricePln > 0
          ? Math.round(localPricePln)
          : 0,
    });
    if (out.length >= 20) break;
  }
  return out;
}

function sanitizeCompetitors(raw: unknown): CouncilCompetitorInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CouncilCompetitorInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) continue;
    const rating = Number(obj.rating);
    const reviewCount = Number(obj.reviewCount);
    out.push({
      name: name.slice(0, 80),
      rating:
        Number.isFinite(rating) && rating > 0 && rating <= 5
          ? Math.round(rating * 10) / 10
          : undefined,
      reviewCount:
        Number.isFinite(reviewCount) && reviewCount > 0
          ? Math.round(reviewCount)
          : undefined,
      priceSummary: String(obj.priceSummary ?? "").slice(0, 180),
      travelFeeNote:
        typeof obj.travelFeeNote === "string"
          ? obj.travelFeeNote.slice(0, 120)
          : undefined,
    });
    if (out.length >= 12) break;
  }
  return out;
}

function sanitizePainPoints(raw: unknown): CouncilPainPointInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CouncilPainPointInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const label = typeof obj.label === "string" ? obj.label.trim() : "";
    const score = Number(obj.score);
    if (!label) continue;
    out.push({
      label: label.slice(0, 90),
      score: Number.isFinite(score)
        ? Math.min(100, Math.max(1, Math.round(score)))
        : 50,
      evidence:
        typeof obj.evidence === "string"
          ? obj.evidence.slice(0, 140)
          : undefined,
    });
    if (out.length >= 6) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 },
      );
    }

    const city =
      typeof body.city === "string" && body.city.trim()
        ? body.city.trim().slice(0, 80)
        : "Radom";
    const industryId = parseIndustry(body.industryId);
    const parsedRadius = Number(body.radiusKm);
    const radiusKm = Number.isFinite(parsedRadius)
      ? Math.min(100, Math.max(10, Math.round(parsedRadius)))
      : 30;
    const locale = body.locale === "en" ? "en" : "pl";
    const parsedGap = Number(body.avgGapPct);
    const avgGapPct = Number.isFinite(parsedGap)
      ? Math.min(200, Math.max(-100, Math.round(parsedGap)))
      : 0;

    const townsInRadius = Array.isArray(body.townsInRadius)
      ? body.townsInRadius
          .filter(
            (t): t is string => typeof t === "string" && t.trim().length > 0,
          )
          .map((t) => t.trim().slice(0, 60))
          .slice(0, 15)
      : [city];

    const humanNote =
      typeof body.humanNote === "string"
        ? body.humanNote.trim().slice(0, 240)
        : undefined;

    const lessonsLearned = Array.isArray(body.lessonsLearned)
      ? body.lessonsLearned
          .filter(
            (l): l is string => typeof l === "string" && l.trim().length > 0,
          )
          .map((l) => l.trim().slice(0, 180))
          .slice(0, 8)
      : [];

    const input: CouncilRequestInput = {
      city,
      industryId,
      radiusKm,
      locale,
      avgGapPct,
      townsInRadius,
      services: sanitizeServices(body.services),
      competitors: sanitizeCompetitors(body.competitors),
      painPoints: sanitizePainPoints(body.painPoints),
      humanNote,
      lessonsLearned,
    };

    const cacheKey = JSON.stringify([
      input.city,
      input.industryId,
      input.radiusKm,
      input.locale,
      input.avgGapPct,
      input.services.map(
        (s) => `${s.serviceKey}:${s.ourPricePln}:${s.localPricePln}`,
      ),
      input.competitors.length,
      input.humanNote ?? "",
      input.lessonsLearned ?? [],
    ]);

    const cached = councilCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        ...cached.result,
        cached: true,
      });
    }

    const result = await runAiCouncil(input);
    if (result.aiEnhanced) {
      councilCache.set(cacheKey, {
        expiresAt: Date.now() + COUNCIL_CACHE_TTL_MS,
        result,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/council POST] error:", err);
    return NextResponse.json(
      {
        error: "AI Council execution failed",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
