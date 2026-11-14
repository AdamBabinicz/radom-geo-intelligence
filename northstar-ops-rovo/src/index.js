import api, { route } from "@forge/api";

const DEFAULT_CONFLUENCE_SPACE_KEY = "northstarg";
const DEFAULT_JIRA_PROJECT_KEY = "KAN";

const RADOM_TOWNS = [
  { name: "Radom", distKm: 0, driveMin: 0, travelFeePln: 0 },
  { name: "Skaryszew", distKm: 12.6, driveMin: 15, travelFeePln: 20 },
  { name: "Jedlińsk", distKm: 14.0, driveMin: 16, travelFeePln: 25 },
  { name: "Przytyk", distKm: 18.2, driveMin: 22, travelFeePln: 25 },
  { name: "Wierzbica", distKm: 18.3, driveMin: 21, travelFeePln: 30 },
  { name: "Pionki", distKm: 22.7, driveMin: 25, travelFeePln: 20 },
  { name: "Iłża", distKm: 27.4, driveMin: 28, travelFeePln: 35 },
  { name: "Szydłowiec", distKm: 27.8, driveMin: 29, travelFeePln: 35 },
  { name: "Kozienice", distKm: 34.1, driveMin: 35, travelFeePln: 35 },
  { name: "Zwoleń", distKm: 32.0, driveMin: 34, travelFeePln: 35 },
  { name: "Przysucha", distKm: 41.0, driveMin: 42, travelFeePln: 45 },
];

const INDUSTRY_BASELINES = {
  upholstery: {
    label: "Upholstery & Carpet Cleaning (Pranie dywanów i tapicerki)",
    targetRadiusKm: 30,
    services: [
      { name: "Carpet washing (per m2)", ourPln: 28, marketAvgPln: 27 },
      {
        name: "Office/home fitted carpet (per m2)",
        ourPln: 8,
        marketAvgPln: 16,
      },
      { name: "Upholstered chair", ourPln: 15, marketAvgPln: 25 },
      { name: "Corner sofa (Narożnik)", ourPln: 200, marketAvgPln: 250 },
      { name: "2-seat sofa", ourPln: 120, marketAvgPln: 160 },
    ],
    painPoints: [
      { issue: "Long drying time / wet fabric complaints", frequencyPct: 85 },
      { issue: "Tough pet odor & deep stain removal", frequencyPct: 80 },
      { issue: "Hidden travel fees outside city center", frequencyPct: 65 },
      { issue: "Long wait times during seasonal peak", frequencyPct: 55 },
    ],
  },
  hvac: {
    label: "HVAC & Heat Pump Service (Klimatyzacja i pompy ciepła)",
    targetRadiusKm: 45,
    services: [
      { name: "Split AC seasonal maintenance", ourPln: 240, marketAvgPln: 310 },
      { name: "Heat pump inspection", ourPln: 380, marketAvgPln: 450 },
      { name: "Duct cleaning & ozonation", ourPln: 320, marketAvgPln: 400 },
    ],
    painPoints: [
      {
        issue: "No technician availability before heatwaves",
        frequencyPct: 88,
      },
      { issue: "Unclear refrigerant & travel surcharges", frequencyPct: 72 },
      { issue: "Lack of warranty service protocol", frequencyPct: 60 },
    ],
  },
  plumbing: {
    label: "Plumbing & Heating Hydraulics (Hydraulika i CO)",
    targetRadiusKm: 30,
    services: [
      { name: "Leak detection & sealing", ourPln: 190, marketAvgPln: 260 },
      {
        name: "Boiler / central heating check",
        ourPln: 280,
        marketAvgPln: 340,
      },
      {
        name: "Drain unclogging (WUKO / spiral)",
        ourPln: 220,
        marketAvgPln: 290,
      },
    ],
    painPoints: [
      { issue: "Slow emergency dispatch times", frequencyPct: 90 },
      { issue: "Unpredictable on-site quote jumps", frequencyPct: 74 },
      { issue: "Missing post-repair photo report", frequencyPct: 52 },
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

function normalizeIndustry(raw) {
  const lower = cleanString(raw, "upholstery").toLowerCase();
  if (
    lower.includes("hvac") ||
    lower.includes("klim") ||
    lower.includes("pomp")
  ) {
    return "hvac";
  }
  if (
    lower.includes("plumb") ||
    lower.includes("hydraul") ||
    lower.includes("kot")
  ) {
    return "plumbing";
  }
  return "upholstery";
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
  return {
    type: "doc",
    version: 1,
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text: String(text) }],
    })),
  };
}

function computeZoneTravelFeePln(distanceKm) {
  if (distanceKm <= 0) return 0;
  if (distanceKm <= 15) return 20;
  if (distanceKm <= 25) return 25;
  if (distanceKm <= 35) return 35;
  if (distanceKm <= 50) return 45;
  if (distanceKm <= 75) return 65;
  return 85;
}

async function resolveConfluenceSpace(requestedKey) {
  const targetKey = cleanString(requestedKey, DEFAULT_CONFLUENCE_SPACE_KEY);
  const byKeyRes = await api
    .asUser()
    .requestConfluence(route`/wiki/api/v2/spaces?keys=${targetKey}&limit=5`, {
      headers: { Accept: "application/json" },
    });
  if (byKeyRes.ok) {
    const byKeyData = await byKeyRes.json();
    if (Array.isArray(byKeyData?.results) && byKeyData.results.length > 0) {
      return byKeyData.results[0];
    }
  }

  const fallbackRes = await api
    .asUser()
    .requestConfluence(route`/wiki/api/v2/spaces?limit=5`, {
      headers: { Accept: "application/json" },
    });
  if (fallbackRes.ok) {
    const fallbackData = await fallbackRes.json();
    if (
      Array.isArray(fallbackData?.results) &&
      fallbackData.results.length > 0
    ) {
      return fallbackData.results[0];
    }
  }

  throw new Error(`Could not resolve Confluence space "${targetKey}".`);
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
    return directRes.json();
  }

  const searchRes = await api
    .asUser()
    .requestJira(route`/rest/api/3/project/search?maxResults=10`, {
      headers: { Accept: "application/json" },
    });
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    const candidates = Array.isArray(searchData?.values)
      ? searchData.values
      : [];
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

export async function getMarketBrief(rawPayload) {
  const input = extractPayload(rawPayload);
  const city = cleanString(input.city, "Radom");
  const industryKey = normalizeIndustry(input.industry);
  const baseline = INDUSTRY_BASELINES[industryKey];
  const radiusKm = clampNumber(
    input.radiusKm,
    10,
    100,
    baseline.targetRadiusKm,
  );

  let confluenceSpace = null;
  let jiraProject = null;

  try {
    const space = await resolveConfluenceSpace(DEFAULT_CONFLUENCE_SPACE_KEY);
    confluenceSpace = { id: space.id, key: space.key, name: space.name };
  } catch (err) {
    confluenceSpace = {
      error: err instanceof Error ? err.message : "Space unavailable",
    };
  }

  try {
    const proj = await resolveJiraProject(DEFAULT_JIRA_PROJECT_KEY);
    jiraProject = {
      key: proj.key,
      name: proj.name,
      issueTypes: Array.isArray(proj.issueTypes)
        ? proj.issueTypes.filter((t) => !t.subtask).map((t) => t.name)
        : [],
    };
  } catch (err) {
    jiraProject = {
      error: err instanceof Error ? err.message : "Project unavailable",
    };
  }

  const isRadom = city.toLowerCase() === "radom";
  const townsInRadius = isRadom
    ? RADOM_TOWNS.filter((t) => t.distKm <= radiusKm)
    : [{ name: city, distKm: 0, driveMin: 0, travelFeePln: 0 }];

  return {
    city,
    industry: industryKey,
    industryLabel: baseline.label,
    targetRadiusKm: radiusKm,
    serviceableTownsCount: townsInRadius.length,
    townsInRadius: townsInRadius.map((t) => t.name),
    townDetails: townsInRadius,
    pricingBenchmarks: baseline.services,
    topCustomerPainPoints: baseline.painPoints,
    atlassianWorkspace: {
      confluenceSpace,
      jiraProject,
    },
  };
}

export async function calculateServiceFee(rawPayload) {
  const input = extractPayload(rawPayload);
  const townName = cleanString(input.town, "Radom");
  const orderValuePln = clampNumber(input.orderValuePln, 0, 50000, 200);
  const radiusKm = clampNumber(input.radiusKm, 10, 100, 30);

  const knownTown = RADOM_TOWNS.find(
    (t) => t.name.toLowerCase() === townName.toLowerCase(),
  );

  const distanceKm = knownTown
    ? knownTown.distKm
    : clampNumber(input.distanceKm, 0, 200, 0);

  const travelFeePln = knownTown
    ? knownTown.travelFeePln
    : computeZoneTravelFeePln(distanceKm);

  const inStandardZone = distanceKm <= radiusKm;
  const totalPln = Math.round((orderValuePln + travelFeePln) * 100) / 100;

  return {
    town: knownTown ? knownTown.name : townName,
    distanceKm,
    radiusKm,
    inStandardZone,
    orderValuePln,
    travelFeePln,
    totalPln,
    currency: "PLN",
    note: inStandardZone
      ? "Within active operational radius."
      : `Outside ${radiusKm} km radius — out-of-zone travel surcharge applies.`,
  };
}

export async function publishConfluencePlaybook(rawPayload) {
  const input = extractPayload(rawPayload);
  const city = cleanString(input.city, "Radom");
  const industryKey = normalizeIndustry(input.industry);
  const baseline = INDUSTRY_BASELINES[industryKey];
  const radiusKm = clampNumber(
    input.radiusKm,
    10,
    100,
    baseline.targetRadiusKm,
  );
  const baseTitle = cleanString(
    input.title,
    `Northstar Ops Playbook: ${city} (${industryKey}, ${radiusKm} km)`,
  );
  const summary = cleanString(
    input.summary,
    `Regional pricing and expansion strategy for ${city} (${radiusKm} km radius) in ${baseline.label}.`,
  );

  const space = await resolveConfluenceSpace(input.spaceKey);

  const serviceRowsHtml = baseline.services
    .map((s) => {
      const gapPct = Math.round(
        ((s.ourPln - s.marketAvgPln) / s.marketAvgPln) * 100,
      );
      const gapLabel = `${gapPct > 0 ? "+" : ""}${gapPct}%`;
      return `<tr><td>${escapeHtml(s.name)}</td><td>${s.ourPln} PLN</td><td>${s.marketAvgPln} PLN</td><td>${escapeHtml(gapLabel)}</td></tr>`;
    })
    .join("");

  const painListHtml = baseline.painPoints
    .map(
      (p) =>
        `<li><strong>${p.frequencyPct}%</strong> — ${escapeHtml(p.issue)}</li>`,
    )
    .join("");

  const storageHtml = `
    <h1>Northstar Ops — Geo-Intelligence &amp; Pricing Playbook</h1>
    <p><strong>City / Region:</strong> ${escapeHtml(city)} (Coverage radius: ${radiusKm} km)<br/>
    <strong>Industry:</strong> ${escapeHtml(baseline.label)}<br/>
    <strong>Generated:</strong> ${escapeHtml(new Date().toISOString().slice(0, 16).replace("T", " "))} UTC</p>
    <h2>Executive Strategy Summary</h2>
    <p>${escapeHtml(summary).replace(/\n+/g, "<br/>")}</p>
    <h2>Service Pricing Benchmarks</h2>
    <table>
      <thead>
        <tr><th>Service</th><th>Target Price</th><th>Market Avg</th><th>Gap</th></tr>
      </thead>
      <tbody>${serviceRowsHtml}</tbody>
    </table>
    <h2>Top Local Customer Pain Points</h2>
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
  const city = cleanString(input.city, "Radom");
  const industryKey = normalizeIndustry(input.industry);
  const campaignTitle = cleanString(
    input.campaignTitle,
    `Northstar Ops Expansion — ${city} (${industryKey})`,
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
        `Market: ${city} | Industry: ${industryKey}`,
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
          `Audit top 5 ${industryKey} competitors in ${city} and verify travel fees`,
          `Update website pricing matrix and fast-drying USP for ${city}`,
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
        `Market: ${city} | Industry: ${industryKey}`,
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
