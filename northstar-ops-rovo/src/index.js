import api, { route } from "@forge/api";
import Resolver from "@forge/resolver";

const DEFAULT_CONFLUENCE_SPACE_KEY = "northstarg";
const DEFAULT_JIRA_PROJECT_KEY = "KAN";

const CURRENCY_CONFIG = {
  PLN: { code: "PLN", rateFromPln: 1 },
  USD: { code: "USD", rateFromPln: 0.25 },
  EUR: { code: "EUR", rateFromPln: 0.23 },
  GBP: { code: "GBP", rateFromPln: 0.2 },
};

const REFERENCE_CASE_STUDY_CITY = "Radom";

const REFERENCE_RADOM_TOWNS = [
  { name: "Radom", distKm: 0, driveMin: 0, travelFeePln: 0 },
  { name: "Skaryszew", distKm: 12.6, driveMin: 15, travelFeePln: 20 },
  { name: "Jedlińsk", distKm: 14.0, driveMin: 16, travelFeePln: 25 },
  { name: "Przytyk", distKm: 18.2, driveMin: 22, travelFeePln: 25 },
  { name: "Wierzbica", distKm: 18.3, driveMin: 21, travelFeePln: 30 },
  { name: "Pionki", distKm: 22.7, driveMin: 25, travelFeePln: 20 },
  { name: "Iłża", distKm: 27.4, driveMin: 28, travelFeePln: 35 },
  { name: "Szydłowiec", distKm: 27.8, driveMin: 29, travelFeePln: 35 },
  { name: "Zwoleń", distKm: 32.0, driveMin: 34, travelFeePln: 35 },
  { name: "Kozienice", distKm: 34.1, driveMin: 35, travelFeePln: 35 },
  { name: "Przysucha", distKm: 41.0, driveMin: 42, travelFeePln: 45 },
];

const ZONE_FEE_TIERS_PLN = [
  { maxKm: 0, feePln: 0 },
  { maxKm: 15, feePln: 20 },
  { maxKm: 25, feePln: 25 },
  { maxKm: 35, feePln: 35 },
  { maxKm: 50, feePln: 45 },
  { maxKm: 75, feePln: 65 },
  { maxKm: Number.POSITIVE_INFINITY, feePln: 85 },
];

const INDUSTRY_BASELINES = {
  upholstery: {
    label: "Upholstery & Carpet Cleaning",
    targetRadiusKm: 30,
    services: [
      { name: "Carpet washing (per m2)", ourPln: 28, marketAvgPln: 34 },
      {
        name: "Office/home fitted carpet (per m2)",
        ourPln: 15,
        marketAvgPln: 20,
      },
      { name: "Upholstered chair (per piece)", ourPln: 15, marketAvgPln: 20 },
      { name: "Corner sofa", ourPln: 250, marketAvgPln: 280 },
    ],
    painPoints: [
      { issue: "Long drying time / wet fabric complaints", frequencyPct: 38 },
      { issue: "Hidden travel fees outside city center", frequencyPct: 31 },
      { issue: "Punctuality & seasonal wait times", frequencyPct: 19 },
    ],
  },
  hvac: {
    label: "HVAC & Heat Pump Service",
    targetRadiusKm: 45,
    services: [
      { name: "Split AC seasonal maintenance", ourPln: 319, marketAvgPln: 360 },
      { name: "Heat pump inspection", ourPln: 429, marketAvgPln: 490 },
      {
        name: "Duct cleaning & ozonation (per m2)",
        ourPln: 39,
        marketAvgPln: 45,
      },
    ],
    painPoints: [
      {
        issue: "No technician availability before heatwaves",
        frequencyPct: 42,
      },
      { issue: "Unclear refrigerant & travel surcharges", frequencyPct: 29 },
      { issue: "Lack of warranty service protocol", frequencyPct: 18 },
    ],
  },
  plumbing: {
    label: "Plumbing & Heating Hydraulics",
    targetRadiusKm: 30,
    services: [
      { name: "Leak detection & sealing", ourPln: 279, marketAvgPln: 320 },
      {
        name: "Boiler / central heating check",
        ourPln: 369,
        marketAvgPln: 420,
      },
      {
        name: "Drain unclogging (WUKO / spiral)",
        ourPln: 229,
        marketAvgPln: 260,
      },
    ],
    painPoints: [
      { issue: "Slow emergency dispatch times", frequencyPct: 44 },
      { issue: "Unpredictable on-site quote jumps", frequencyPct: 35 },
      { issue: "Missing post-repair cleanup & photo report", frequencyPct: 16 },
    ],
  },
};

function cleanString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function clampNumber(raw, min, max, fallback) {
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeCurrency(raw) {
  const code = cleanString(raw, "PLN").toUpperCase();
  return CURRENCY_CONFIG[code] || CURRENCY_CONFIG.PLN;
}

function convertFromPln(amountPln, currencyCfg) {
  return Math.round(amountPln * currencyCfg.rateFromPln * 100) / 100;
}

function resolveIndustryProfile(raw) {
  const cleaned = cleanString(raw, "upholstery");
  const lower = cleaned.toLowerCase();

  if (
    lower === "upholstery" ||
    lower.includes("upholster") ||
    lower.includes("carpet") ||
    lower.includes("dywan") ||
    lower.includes("tapicerk")
  ) {
    return {
      key: "upholstery",
      isPreset: true,
      ...INDUSTRY_BASELINES.upholstery,
    };
  }
  if (
    lower === "hvac" ||
    lower.includes("hvac") ||
    lower.includes("klim") ||
    lower.includes("pomp") ||
    lower.includes("air condition")
  ) {
    return { key: "hvac", isPreset: true, ...INDUSTRY_BASELINES.hvac };
  }
  if (
    lower === "plumbing" ||
    lower.includes("plumb") ||
    lower.includes("hydraul") ||
    lower.includes("boiler") ||
    lower.includes("drain")
  ) {
    return { key: "plumbing", isPreset: true, ...INDUSTRY_BASELINES.plumbing };
  }

  return {
    key: "custom",
    isPreset: false,
    label: cleaned,
    targetRadiusKm: 30,
    services: [],
    painPoints: [
      {
        issue: "Unclear upfront pricing & travel surcharges",
        frequencyPct: 36,
      },
      {
        issue: "Slow quote turnaround & scheduling friction",
        frequencyPct: 28,
      },
    ],
  };
}

function extractPayload(rawPayload) {
  if (
    rawPayload &&
    typeof rawPayload.payload === "object" &&
    rawPayload.payload !== null
  ) {
    return rawPayload.payload;
  }
  return rawPayload || {};
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAdfDocument(paragraphs) {
  const safe = paragraphs
    .map((text) => String(text || "").trim())
    .filter(Boolean);
  return {
    type: "doc",
    version: 1,
    content: safe.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

function computeZoneTravelFeePln(distanceKm) {
  for (const tier of ZONE_FEE_TIERS_PLN) {
    if (distanceKm <= tier.maxKm) {
      return tier.feePln;
    }
  }
  return 85;
}

function estimateDriveMinutes(distanceKm) {
  if (distanceKm <= 0) return 0;
  return Math.max(5, Math.round(distanceKm * 1.15));
}

async function resolveConfluenceSpace(requestedKey) {
  const explicitKey = cleanString(requestedKey, "");
  const lookupKey = explicitKey || DEFAULT_CONFLUENCE_SPACE_KEY;

  const byKeyRes = await api
    .asUser()
    .requestConfluence(
      route`/wiki/api/v2/spaces?keys=${lookupKey}&status=current&limit=5`,
      { headers: { Accept: "application/json" } },
    );

  if (byKeyRes.ok) {
    const byKeyData = await byKeyRes.json();
    if (Array.isArray(byKeyData?.results) && byKeyData.results.length > 0) {
      return byKeyData.results[0];
    }
  }

  const globalFallbackRes = await api
    .asUser()
    .requestConfluence(
      route`/wiki/api/v2/spaces?type=global&status=current&limit=10`,
      { headers: { Accept: "application/json" } },
    );

  if (globalFallbackRes.ok) {
    const globalData = await globalFallbackRes.json();
    if (Array.isArray(globalData?.results) && globalData.results.length > 0) {
      return globalData.results[0];
    }
  }

  const anyFallbackRes = await api
    .asUser()
    .requestConfluence(route`/wiki/api/v2/spaces?status=current&limit=10`, {
      headers: { Accept: "application/json" },
    });

  if (anyFallbackRes.ok) {
    const anyData = await anyFallbackRes.json();
    if (Array.isArray(anyData?.results) && anyData.results.length > 0) {
      return anyData.results[0];
    }
  }

  throw new Error(
    `No accessible Confluence space found (checked "${lookupKey}" and workspace fallback).`,
  );
}

async function fetchRecentConfluencePages(spaceId) {
  try {
    const res = await api
      .asUser()
      .requestConfluence(
        route`/wiki/api/v2/spaces/${spaceId}/pages?limit=5&sort=-modified-date`,
        { headers: { Accept: "application/json" } },
      );
    if (!res.ok) {
      return { pages: [], note: `Pages list unavailable (HTTP ${res.status})` };
    }
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return {
      pages: results.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        webPath: p?._links?.webui ? `/wiki${p._links.webui}` : null,
      })),
    };
  } catch (err) {
    return {
      pages: [],
      note: err instanceof Error ? err.message : "Pages list unavailable",
    };
  }
}

async function resolveJiraProject(requestedKey) {
  const targetKey = cleanString(
    requestedKey,
    DEFAULT_JIRA_PROJECT_KEY,
  ).toUpperCase();

  const directRes = await api
    .asUser()
    .requestJira(route`/rest/api/3/project/${targetKey}`, {
      headers: { Accept: "application/json" },
    });

  if (directRes.ok) {
    const directProject = await directRes.json();
    if (!directProject?.archived && !directProject?.deleted) {
      return directProject;
    }
  }

  const searchRes = await api
    .asUser()
    .requestJira(route`/rest/api/3/project/search?maxResults=15`, {
      headers: { Accept: "application/json" },
    });

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    const rawCandidates = Array.isArray(searchData?.values)
      ? searchData.values
      : [];
    const candidates = rawCandidates.filter((p) => !p.archived && !p.deleted);
    const preferred =
      candidates.find((p) => p.projectTypeKey === "software") ||
      candidates.find((p) => p.projectTypeKey === "business") ||
      candidates[0];

    if (preferred?.key) {
      const fallbackRes = await api
        .asUser()
        .requestJira(route`/rest/api/3/project/${preferred.key}`, {
          headers: { Accept: "application/json" },
        });
      if (fallbackRes.ok) {
        return fallbackRes.json();
      }
    }
  }

  throw new Error(
    `No accessible Jira project found (tried "${targetKey}" and workspace fallback). Create a Jira project first.`,
  );
}

async function fetchRecentJiraIssues(projectKey) {
  try {
    const jql = `project = "${projectKey}" ORDER BY updated DESC`;
    const res = await api
      .asUser()
      .requestJira(
        route`/rest/api/3/search/jql?jql=${jql}&maxResults=6&fields=summary,status,issuetype,updated`,
        { headers: { Accept: "application/json" } },
      );
    if (!res.ok) {
      return {
        issues: [],
        note: `Issues list unavailable (HTTP ${res.status})`,
      };
    }
    const data = await res.json();
    const list = Array.isArray(data?.issues) ? data.issues : [];
    return {
      issues: list.map((issue) => ({
        key: issue.key,
        summary: issue?.fields?.summary || "",
        status: issue?.fields?.status?.name || "",
        issueType: issue?.fields?.issuetype?.name || "",
        browsePath: `/browse/${issue.key}`,
      })),
    };
  } catch (err) {
    return {
      issues: [],
      note: err instanceof Error ? err.message : "Issues list unavailable",
    };
  }
}

export async function getMarketBrief(rawPayload) {
  const input = extractPayload(rawPayload);
  const city = cleanString(input.city, REFERENCE_CASE_STUDY_CITY);
  const industryProfile = resolveIndustryProfile(input.industry);
  const currencyCfg = normalizeCurrency(input.currency);
  const radiusKm = clampNumber(
    input.radiusKm,
    10,
    100,
    industryProfile.targetRadiusKm,
  );

  let confluenceSpace = null;
  let recentConfluencePages = [];
  let confluencePagesNote;
  try {
    const space = await resolveConfluenceSpace(input.spaceKey);
    confluenceSpace = { id: space.id, key: space.key, name: space.name };
    const pageLookup = await fetchRecentConfluencePages(space.id);
    recentConfluencePages = pageLookup.pages;
    confluencePagesNote = pageLookup.note;
  } catch (err) {
    confluenceSpace = {
      error: err instanceof Error ? err.message : "Space unavailable",
    };
  }

  let jiraProject = null;
  let recentJiraIssues = [];
  let jiraIssuesNote;
  try {
    const proj = await resolveJiraProject(input.projectKey);
    jiraProject = {
      key: proj.key,
      name: proj.name,
      issueTypes: Array.isArray(proj.issueTypes)
        ? proj.issueTypes.filter((t) => !t.subtask).map((t) => t.name)
        : [],
    };
    const issueLookup = await fetchRecentJiraIssues(proj.key);
    recentJiraIssues = issueLookup.issues;
    jiraIssuesNote = issueLookup.note;
  } catch (err) {
    jiraProject = {
      error: err instanceof Error ? err.message : "Project unavailable",
    };
  }

  const isReferenceCity =
    city.toLowerCase() === REFERENCE_CASE_STUDY_CITY.toLowerCase();

  const townsInRadius = isReferenceCity
    ? REFERENCE_RADOM_TOWNS.filter((t) => t.distKm <= radiusKm).map((t) => ({
        name: t.name,
        distKm: t.distKm,
        driveMin: t.driveMin,
        travelFee: convertFromPln(t.travelFeePln, currencyCfg),
        currency: currencyCfg.code,
      }))
    : [
        {
          name: city,
          distKm: 0,
          driveMin: 0,
          travelFee: 0,
          currency: currencyCfg.code,
        },
      ];

  const pricingBenchmarks = industryProfile.services.map((s) => ({
    name: s.name,
    ourPrice: convertFromPln(s.ourPln, currencyCfg),
    marketAvg: convertFromPln(s.marketAvgPln, currencyCfg),
    currency: currencyCfg.code,
  }));

  return {
    city,
    industry: industryProfile.key,
    industryLabel: industryProfile.label,
    isPresetIndustry: industryProfile.isPreset,
    currency: currencyCfg.code,
    targetRadiusKm: radiusKm,
    geoDataSource: isReferenceCity
      ? "built-in-radom-case-study"
      : "zone-model-plus-atlassian-context",
    geoCoverageNote: isReferenceCity
      ? `Reference GPS dataset active for ${REFERENCE_CASE_STUDY_CITY}.`
      : `Dynamic mode for ${city}. Pass distanceKm to calculate-service-fee for surrounding towns or sync live OSM/SERP competitors via the Northstar Ops Web Hub.`,
    serviceableTownsCount: townsInRadius.length,
    townsInRadius: townsInRadius.map((t) => t.name),
    townDetails: townsInRadius,
    pricingBenchmarks,
    topCustomerPainPoints: industryProfile.painPoints,
    atlassianWorkspace: {
      runsOnAtlassianZeroEgress: true,
      confluenceSpace,
      recentConfluencePages,
      ...(confluencePagesNote ? { confluencePagesNote } : {}),
      jiraProject,
      recentJiraIssues,
      ...(jiraIssuesNote ? { jiraIssuesNote } : {}),
    },
  };
}

export async function calculateServiceFee(rawPayload) {
  const input = extractPayload(rawPayload);
  const townName = cleanString(input.town, REFERENCE_CASE_STUDY_CITY);
  const currencyCfg = normalizeCurrency(input.currency);
  const rawOrderValue =
    input.orderValue !== undefined ? input.orderValue : input.orderValuePln;
  const orderValue = clampNumber(rawOrderValue, 0, 500000, 200);
  const radiusKm = clampNumber(input.radiusKm, 10, 100, 30);

  const knownTown = REFERENCE_RADOM_TOWNS.find(
    (t) => t.name.toLowerCase() === townName.toLowerCase(),
  );

  const distanceKm =
    typeof input.distanceKm === "number" && Number.isFinite(input.distanceKm)
      ? clampNumber(input.distanceKm, 0, 500, 0)
      : knownTown
        ? knownTown.distKm
        : 0;

  const travelFeePln =
    knownTown && input.distanceKm === undefined
      ? knownTown.travelFeePln
      : computeZoneTravelFeePln(distanceKm);

  const travelFee = convertFromPln(travelFeePln, currencyCfg);
  const driveMin =
    knownTown && input.distanceKm === undefined
      ? knownTown.driveMin
      : estimateDriveMinutes(distanceKm);

  const inStandardZone = distanceKm <= radiusKm;
  const total = Math.round((orderValue + travelFee) * 100) / 100;

  return {
    town: knownTown ? knownTown.name : townName,
    distanceKm,
    estimatedDriveMin: driveMin,
    radiusKm,
    inStandardZone,
    orderValue,
    travelFee,
    total,
    currency: currencyCfg.code,
    note: inStandardZone
      ? `Within active ${radiusKm} km operational radius.`
      : `Outside ${radiusKm} km radius — out-of-zone travel surcharge applies.`,
  };
}

export async function publishConfluencePlaybook(rawPayload) {
  const input = extractPayload(rawPayload);
  const city = cleanString(input.city, REFERENCE_CASE_STUDY_CITY);
  const industryProfile = resolveIndustryProfile(input.industry);
  const currencyCfg = normalizeCurrency(input.currency);
  const radiusKm = clampNumber(
    input.radiusKm,
    10,
    100,
    industryProfile.targetRadiusKm,
  );
  const baseTitle = cleanString(
    input.title,
    `Northstar Ops Playbook: ${city} (${industryProfile.label}, ${radiusKm} km)`,
  );
  const summary = cleanString(
    input.summary,
    `Regional pricing and expansion strategy for ${city} (${radiusKm} km radius) in ${industryProfile.label}.`,
  );

  const space = await resolveConfluenceSpace(input.spaceKey);

  const benchmarkSectionHtml =
    industryProfile.services.length > 0
      ? `<h2>Reference Pricing Benchmarks (${escapeHtml(currencyCfg.code)})</h2>
         <table>
           <thead>
             <tr><th>Service</th><th>Target Price</th><th>Market Avg</th><th>Gap</th></tr>
           </thead>
           <tbody>
             ${industryProfile.services
               .map((s) => {
                 const ourPrice = convertFromPln(s.ourPln, currencyCfg);
                 const avgPrice = convertFromPln(s.marketAvgPln, currencyCfg);
                 const gapPct = Math.round(
                   ((s.ourPln - s.marketAvgPln) / s.marketAvgPln) * 100,
                 );
                 const gapLabel = `${gapPct > 0 ? "+" : ""}${gapPct}%`;
                 return `<tr><td>${escapeHtml(s.name)}</td><td>${ourPrice} ${escapeHtml(currencyCfg.code)}</td><td>${avgPrice} ${escapeHtml(currencyCfg.code)}</td><td>${escapeHtml(gapLabel)}</td></tr>`;
               })
               .join("")}
           </tbody>
         </table>`
      : `<h2>Service Niche Scope</h2>
         <p>Custom service niche playbook for <strong>${escapeHtml(industryProfile.label)}</strong> in <strong>${escapeHtml(city)}</strong> (${radiusKm} km radius, ${escapeHtml(currencyCfg.code)}).</p>`;

  const painListHtml = industryProfile.painPoints
    .map(
      (p) =>
        `<li><strong>${p.frequencyPct}%</strong> — ${escapeHtml(p.issue)}</li>`,
    )
    .join("");

  const storageHtml = `
    <h1>Northstar Ops — Geo-Intelligence &amp; Pricing Playbook</h1>
    <p><strong>City / Region:</strong> ${escapeHtml(city)} (Coverage radius: ${radiusKm} km)<br/>
    <strong>Industry:</strong> ${escapeHtml(industryProfile.label)}<br/>
    <strong>Currency:</strong> ${escapeHtml(currencyCfg.code)}<br/>
    <strong>Generated:</strong> ${escapeHtml(new Date().toISOString().slice(0, 16).replace("T", " "))} UTC</p>
    <h2>Executive Strategy Summary</h2>
    <p>${escapeHtml(summary).replace(/\n+/g, "<br/>")}</p>
    ${benchmarkSectionHtml}
    <h2>Priority Customer Pain Points to Address</h2>
    <ul>${painListHtml}</ul>
  `.trim();

  async function createPageWithTitle(pageTitle) {
    return api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spaceId: String(space.id),
        status: "current",
        title: pageTitle,
        body: {
          representation: "storage",
          value: storageHtml,
        },
      }),
    });
  }

  let finalTitle = baseTitle;
  let createRes = await createPageWithTitle(finalTitle);

  if (createRes.status === 400) {
    const suffix = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    finalTitle = `${baseTitle} [${suffix}]`;
    createRes = await createPageWithTitle(finalTitle);
  }

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(
      `Confluence API ${createRes.status}: ${errorText.slice(0, 300)}`,
    );
  }

  const created = await createRes.json();
  return {
    ok: true,
    pageId: created.id,
    title: created.title,
    spaceKey: space.key,
    spaceId: space.id,
    webPath: created?._links?.webui ? `/wiki${created._links.webui}` : null,
  };
}

export async function createJiraCampaign(rawPayload) {
  const input = extractPayload(rawPayload);
  const city = cleanString(input.city, REFERENCE_CASE_STUDY_CITY);
  const industryProfile = resolveIndustryProfile(input.industry);
  const campaignTitle = cleanString(
    input.campaignTitle,
    `Northstar Ops Expansion — ${city} (${industryProfile.label})`,
  );

  const projectData = await resolveJiraProject(input.projectKey);
  const projectKey = projectData.key;

  const validIssueTypes = Array.isArray(projectData?.issueTypes)
    ? projectData.issueTypes.filter((t) => !t.subtask)
    : [];

  const epicType = validIssueTypes.find((t) => /^(epic|epik)$/i.test(t.name));
  const taskType =
    validIssueTypes.find((t) =>
      /^(task|zadanie|story|historia)$/i.test(t.name),
    ) || validIssueTypes[0];

  if (!taskType) {
    throw new Error(
      `No usable standard issue type found in Jira project "${projectKey}".`,
    );
  }

  async function postJiraIssue(fields) {
    return api.asUser().requestJira(route`/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
  }

  let epicIssue = null;
  if (epicType && epicType.id !== taskType.id) {
    const epicRes = await postJiraIssue({
      project: { key: projectKey },
      summary: `[Northstar Ops | ${city}] ${campaignTitle}`.slice(0, 240),
      issuetype: { id: epicType.id },
      description: buildAdfDocument([
        `Campaign: ${campaignTitle}`,
        `Market: ${city} | Industry: ${industryProfile.label}`,
        "Parent campaign Epic created by Northstar Ops Geo Strategist (Atlassian Rovo + Forge).",
      ]),
    });

    if (epicRes.ok) {
      const createdEpic = await epicRes.json();
      epicIssue = {
        id: createdEpic.id,
        key: createdEpic.key,
        browsePath: `/browse/${createdEpic.key}`,
      };
    }
  }

  const rawItems = cleanString(input.actionItems, "")
    .split(/[;\n]+/)
    .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 4);

  const tasks =
    rawItems.length > 0
      ? rawItems
      : [
          `Audit top 5 ${industryProfile.label} competitors in ${city} and verify travel fees`,
          `Update website pricing matrix and transparent zone-fee messaging for ${city}`,
          `Launch Google Business Profile & local district outreach around ${city}`,
        ];

  const createdIssues = [];
  const failedIssues = [];

  for (const taskText of tasks) {
    const summary = `[Northstar Ops | ${city}] ${taskText}`.slice(0, 240);
    const baseFields = {
      project: { key: projectKey },
      summary,
      issuetype: { id: taskType.id },
      description: buildAdfDocument([
        `Campaign: ${campaignTitle}`,
        `Market: ${city} | Industry: ${industryProfile.label}`,
        `Action item: ${taskText}`,
        epicIssue
          ? `Parent Epic: ${epicIssue.key}`
          : "Standalone campaign task.",
        "Generated automatically by Northstar Ops Geo Strategist (Atlassian Rovo + Forge).",
      ]),
    };

    let issueRes = await postJiraIssue(
      epicIssue
        ? { ...baseFields, parent: { key: epicIssue.key } }
        : baseFields,
    );

    if (!issueRes.ok && epicIssue) {
      issueRes = await postJiraIssue(baseFields);
    }

    if (issueRes.ok) {
      const created = await issueRes.json();
      createdIssues.push({
        id: created.id,
        key: created.key,
        summary,
        browsePath: `/browse/${created.key}`,
      });
    } else {
      const errBody = await issueRes.text();
      failedIssues.push({
        summary,
        status: issueRes.status,
        error: errBody.slice(0, 200),
      });
    }
  }

  return {
    ok: createdIssues.length > 0 || epicIssue !== null,
    projectKey,
    epicIssue,
    issueTypeUsed: taskType.name,
    campaignTitle,
    createdCount: createdIssues.length,
    createdIssues,
    failedIssues,
  };
}

async function createJiraQuoteTicket(rawPayload, context) {
  const input = extractPayload(rawPayload);
  const projectKey = cleanString(
    input.projectKey,
    context?.extension?.project?.key || DEFAULT_JIRA_PROJECT_KEY,
  ).toUpperCase();
  const town = cleanString(input.town, REFERENCE_CASE_STUDY_CITY);
  const serviceLabel = cleanString(input.serviceLabel, "Service Quote");

  const quote = await calculateServiceFee({
    town,
    orderValue: input.orderValue,
    radiusKm: input.radiusKm,
    distanceKm: input.distanceKm,
    currency: input.currency,
  });

  const projectData = await resolveJiraProject(projectKey);
  const validIssueTypes = Array.isArray(projectData?.issueTypes)
    ? projectData.issueTypes.filter((t) => !t.subtask)
    : [];

  const taskType =
    validIssueTypes.find((t) =>
      /^(task|zadanie|story|historia)$/i.test(t.name),
    ) || validIssueTypes[0];

  if (!taskType) {
    throw new Error(
      `No usable standard issue type found in Jira project "${projectData.key}".`,
    );
  }

  const summary =
    `[Quote] ${serviceLabel} · ${quote.town} · ${quote.total} ${quote.currency}`.slice(
      0,
      240,
    );

  const issueRes = await api.asUser().requestJira(route`/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectData.key },
        summary,
        issuetype: { id: taskType.id },
        description: buildAdfDocument([
          `Service: ${serviceLabel}`,
          `Town: ${quote.town} (${quote.distanceKm} km, ~${quote.estimatedDriveMin} min)`,
          `Zone status: ${quote.inStandardZone ? "Inside standard radius" : "Outside standard radius"} (${quote.radiusKm} km)`,
          `Order value: ${quote.orderValue} ${quote.currency} | Travel fee: ${quote.travelFee} ${quote.currency}`,
          `Total quote: ${quote.total} ${quote.currency}`,
          "Created directly from Northstar Ops Jira Project Page (Forge UI Kit).",
        ]),
      },
    }),
  });

  if (!issueRes.ok) {
    const errText = await issueRes.text();
    throw new Error(`Jira API ${issueRes.status}: ${errText.slice(0, 200)}`);
  }

  const created = await issueRes.json();
  return {
    ok: true,
    key: created.key,
    projectKey: projectData.key,
    summary,
    quote,
    browsePath: `/browse/${created.key}`,
  };
}

const resolver = new Resolver();

resolver.define("getProjectWorkspaceData", async ({ payload, context }) => {
  const projectKey = cleanString(
    payload?.projectKey,
    context?.extension?.project?.key || DEFAULT_JIRA_PROJECT_KEY,
  ).toUpperCase();

  return getMarketBrief({
    city: cleanString(payload?.city, REFERENCE_CASE_STUDY_CITY),
    industry: cleanString(payload?.industry, "upholstery"),
    radiusKm: clampNumber(payload?.radiusKm, 10, 100, 30),
    currency: cleanString(payload?.currency, "PLN"),
    spaceKey: payload?.spaceKey,
    projectKey,
  });
});

resolver.define("calculateQuote", async ({ payload }) =>
  calculateServiceFee(payload),
);

resolver.define("createQuoteTicket", async ({ payload, context }) =>
  createJiraQuoteTicket(payload, context),
);

resolver.define("publishPlaybook", async ({ payload }) =>
  publishConfluencePlaybook(payload),
);

resolver.define("createCampaign", async ({ payload, context }) =>
  createJiraCampaign({
    ...(payload || {}),
    projectKey: cleanString(
      payload?.projectKey,
      context?.extension?.project?.key || DEFAULT_JIRA_PROJECT_KEY,
    ),
  }),
);

export const projectPageResolver = resolver.getDefinitions();
