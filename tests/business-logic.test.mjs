import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function loadTsModule(relPath) {
  const source = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(outputText, "utf8").toString("base64")}`;
  return import(dataUrl);
}

test("geo-math calculates symmetric Haversine distances and local cos(lat) projections", async () => {
  const { haversineDistanceKm, projectToLocalKm } = await loadTsModule(
    "src/lib/geo-math.ts",
  );

  const radom = { lat: 51.4027, lon: 21.1471 };
  const pionki = { lat: 51.4774, lon: 21.4519 };

  assert.equal(haversineDistanceKm(radom, radom), 0);

  const d1 = haversineDistanceKm(radom, pionki);
  const d2 = haversineDistanceKm(pionki, radom);
  assert.equal(d1, d2);
  assert.ok(d1 > 21 && d1 < 24, `Expected Radom-Pionki ~22.7 km, got ${d1}`);

  const proj = projectToLocalKm(radom, pionki);
  assert.ok(proj.dxKm > 0, "Pionki should be east (+dxKm) of Radom");
  assert.ok(proj.dyKm > 0, "Pionki should be north (+dyKm) of Radom");
  assert.equal(proj.distKm, d1);
});

test("zone pricing and drive-time tiers remain monotonic across 0-100 km", async () => {
  const { estimateDriveMinutes, estimateZoneTravelFeePln } = await loadTsModule(
    "src/lib/geo-math.ts",
  );

  assert.equal(estimateDriveMinutes(0), 0);
  assert.equal(estimateDriveMinutes(1), 0);
  assert.equal(estimateDriveMinutes(2), 5);
  assert.equal(estimateDriveMinutes(22), 25);

  assert.equal(estimateZoneTravelFeePln(0), 0);
  assert.equal(estimateZoneTravelFeePln(2), 0);
  assert.equal(estimateZoneTravelFeePln(10), 20);
  assert.equal(estimateZoneTravelFeePln(15), 20);
  assert.equal(estimateZoneTravelFeePln(22), 25);
  assert.equal(estimateZoneTravelFeePln(25), 25);
  assert.equal(estimateZoneTravelFeePln(30), 35);
  assert.equal(estimateZoneTravelFeePln(45), 35);
  assert.equal(estimateZoneTravelFeePln(60), 55);
  assert.equal(estimateZoneTravelFeePln(100), 90);

  const distances = [0, 2, 10, 15, 22, 25, 30, 45, 60, 100];
  for (let i = 1; i < distances.length; i += 1) {
    assert.ok(
      estimateZoneTravelFeePln(distances[i]) >=
        estimateZoneTravelFeePln(distances[i - 1]),
      "Travel fee must be monotonically non-decreasing with distance",
    );
    assert.ok(
      estimateDriveMinutes(distances[i]) >=
        estimateDriveMinutes(distances[i - 1]),
      "Drive time must be monotonically non-decreasing with distance",
    );
  }
});

test("currency conversion and formatting handle PLN/EN precision rules", async () => {
  const { convertFromPln, formatPrice } = await loadTsModule(
    "src/lib/currency.ts",
  );

  assert.equal(convertFromPln(28, "pl"), 28);
  assert.equal(convertFromPln(28, "en"), 7);
  assert.equal(convertFromPln(10, "en"), 2.5);
  assert.equal(convertFromPln(250, "en"), 63);

  assert.equal(formatPrice(250, "en"), "$63");
  const plFormatted = formatPrice(28, "pl");
  assert.ok(plFormatted.includes("28"), `Expected 28 in ${plFormatted}`);
  assert.ok(plFormatted.includes("zł"), `Expected zł in ${plFormatted}`);
});

test("display currency decouples from UI locale and resolves from market country", async () => {
  const {
    convertFromPln,
    convertToPln,
    formatPrice,
    isSupportedDisplayCurrency,
    normalizeDisplayCurrency,
    resolveMarketCurrency,
  } = await loadTsModule("src/lib/currency.ts");

  assert.equal(resolveMarketCurrency("pl", "en"), "PLN");
  assert.equal(resolveMarketCurrency("DE", "pl"), "EUR");
  assert.equal(resolveMarketCurrency("GB", "en"), "GBP");
  assert.equal(resolveMarketCurrency("US", "pl"), "USD");
  assert.equal(resolveMarketCurrency(undefined, "en"), "USD");
  assert.equal(resolveMarketCurrency(undefined, "pl"), "PLN");

  assert.equal(isSupportedDisplayCurrency("PLN"), true);
  assert.equal(isSupportedDisplayCurrency("GBP"), true);
  assert.equal(isSupportedDisplayCurrency("CHF"), false);
  assert.equal(normalizeDisplayCurrency("eur"), "EUR");
  assert.equal(normalizeDisplayCurrency("usd"), "USD");
  assert.equal(normalizeDisplayCurrency("unknown"), "PLN");

  assert.equal(convertToPln(249, "PLN"), 249);
  assert.equal(convertToPln(25, "USD"), 100);
  const eurToPln = convertToPln(100, "EUR");
  assert.ok(
    eurToPln > 350 && eurToPln < 500,
    `Unexpected EUR->PLN: ${eurToPln}`,
  );

  assert.equal(convertFromPln(249, "en", "PLN"), 249);
  const radomInEnglishPln = formatPrice(249, "en", "PLN");
  assert.ok(
    radomInEnglishPln.includes("249"),
    `Expected 249 in ${radomInEnglishPln}`,
  );
  assert.equal(
    radomInEnglishPln.includes("$"),
    false,
    `PLN override must not format as USD: ${radomInEnglishPln}`,
  );
  assert.match(radomInEnglishPln, /PLN|zł/i);

  const eurAmount = convertFromPln(100, "en", "EUR");
  const gbpAmount = convertFromPln(100, "en", "GBP");
  assert.ok(
    eurAmount > 15 && eurAmount < 35,
    `Unexpected EUR amount: ${eurAmount}`,
  );
  assert.ok(
    gbpAmount > 15 && gbpAmount < 35,
    `Unexpected GBP amount: ${gbpAmount}`,
  );
});

test("industry templates and service unit resolvers handle preset and live niches", async () => {
  const { INDUSTRY_TEMPLATES, resolveServiceLabel, resolveUnitType } =
    await loadTsModule("src/config/industries.ts");

  assert.equal(resolveUnitType({ serviceKey: "upholsteryChair" }), "piece");
  assert.equal(
    resolveUnitType({ serviceKey: "carpetArea", isPerUnit: true }),
    "m2",
  );
  assert.equal(resolveUnitType({ serviceKey: "cornerSofa" }), "fixed");

  assert.equal(
    resolveServiceLabel(
      {
        serviceKey: "live:customSteamWash",
        labels: { pl: "Pranie parowe", en: "Steam wash" },
      },
      {},
      "en",
    ),
    "Steam wash",
  );
  assert.equal(
    resolveServiceLabel({ serviceKey: "live:customSteamWash" }, {}, "en"),
    "Custom Steam Wash",
  );

  for (const id of ["upholstery", "hvac", "plumbing"]) {
    const tpl = INDUSTRY_TEMPLATES[id];
    assert.ok(tpl.services.length >= 3, `Expected >=3 services in ${id}`);
    for (const svc of tpl.services) {
      assert.ok(svc.ourPricePln > 0 && svc.localPricePln > 0);
    }
  }
});
