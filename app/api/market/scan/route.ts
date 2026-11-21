import { NextRequest, NextResponse } from "next/server";
import { parseScanParams } from "@/src/backend/market-scan/request-and-safety";
import { runMarketScan } from "@/src/backend/market-scan/scan-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const params = parseScanParams({
      city: sp.get("city") ?? undefined,
      country: sp.get("country") ?? undefined,
      countryCode: sp.get("countryCode") ?? undefined,
      industry: sp.get("industry") ?? sp.get("industryId") ?? undefined,
      radiusKm: sp.get("radiusKm") ?? undefined,
      locale: sp.get("locale") ?? undefined,
      urls: sp.get("urls") ?? undefined,
      excludeUrl: sp.get("excludeUrl") ?? undefined,
    });
    const result = await runMarketScan(params);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[/api/market/scan GET] error:", err);
    return NextResponse.json({ error: "Market scan failed" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const params = parseScanParams(body);
    const result = await runMarketScan(params);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[/api/market/scan POST] error:", err);
    return NextResponse.json({ error: "Market scan failed" }, { status: 502 });
  }
}
