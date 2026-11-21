import { NextRequest, NextResponse } from "next/server";
import { syncWebsitePricing } from "@/src/backend/pricing-sync/sync-service";
import type {
  DetectedIndustryMatch,
  PricingSyncCode,
  SiteProfile,
} from "@/src/backend/pricing-sync/types";

export type { DetectedIndustryMatch, PricingSyncCode, SiteProfile };

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    if (!url) {
      return NextResponse.json(
        {
          error: "Missing ?url= parameter",
          code: "MISSING_URL" satisfies PricingSyncCode,
        },
        { status: 400 },
      );
    }
    const result = await syncWebsitePricing(url, forceRefresh);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[/api/pricing/sync GET] error:", err);
    return NextResponse.json(
      {
        error: "Pricing sync failed",
        code: "SITE_UNREACHABLE" satisfies PricingSyncCode,
      },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      refresh?: boolean;
    };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json(
        {
          error: "Missing url in request body",
          code: "MISSING_URL" satisfies PricingSyncCode,
        },
        { status: 400 },
      );
    }
    const result = await syncWebsitePricing(url, body.refresh === true);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[/api/pricing/sync POST] error:", err);
    return NextResponse.json(
      {
        error: "Pricing sync failed",
        code: "SITE_UNREACHABLE" satisfies PricingSyncCode,
      },
      { status: 502 },
    );
  }
}
