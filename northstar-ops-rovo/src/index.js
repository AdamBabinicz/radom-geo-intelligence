import api, { route } from "@forge/api";

const DEFAULT_CONFLUENCE_SPACE_KEY = "northstarg";
const DEFAULT_JIRA_PROJECT_KEY = "KAN";

const INDUSTRY_BASELINES = {
  upholstery: {
    label: "Upholstery & Carpet Cleaning (Pranie dywanów i tapicerki)",
    targetRadiusKm: 35,
    regionalHubs: [
      "Radom",
      "Pionki",
      "Kozienice",
      "Szydłowiec",
      "Skaryszew",
      "Zwoleń",
      "Przysucha",
      "Iłża",
    ],
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
    regionalHubs: [
      "Radom",
      "Kozienice",
      "Grójec",
      "Białobrzegi",
      "Szydłowiec",
      "Starachowice",
    ],
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
    regionalHubs: [
      "Radom",
      "Skaryszew",
      "Jedlińsk",
      "Kowala",
      "Pionki",
      "Wierzbica",
    ],
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

export async function getMarketBrief(rawPayload) {
  const input = extractPayload(rawPayload);
  const city = cleanString(input.city, "Radom");
  const industryKey = normalizeIndustry(input.industry);
  const baseline = INDUSTRY_BASELINES[industryKey];

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
    const projRes = await api
      .asUser()
      .requestJira(route`/rest/api/3/project/${DEFAULT_JIRA_PROJECT_KEY}`, {
        headers: { Accept: "application/json" },
      });
    if (projRes.ok) {
      const proj = await projRes.json();
      jiraProject = {
        key: proj.key,
        name: proj.name,
        issueTypes: Array.isArray(proj.issueTypes)
          ? proj.issueTypes.filter((t) => !t.subtask).map((t) => t.name)
          : [],
      };
    } else {
      jiraProject = { key: DEFAULT_JIRA_PROJECT_KEY, status: projRes.status };
    }
  } catch (err) {
    jiraProject = {
      error: err instanceof Error ? err.message : "Project unavailable",
    };
  }

  return {
    city,
    industry: industryKey,
    industryLabel: baseline.label,
    targetRadiusKm: baseline.targetRadiusKm,
    regionalHubs:
      city.toLowerCase() === "radom" ? baseline.regionalHubs : [city],
    pricingBenchmarks: baseline.services,
    topCustomerPainPoints: baseline.painPoints,
    atlassianWorkspace: {
      confluenceSpace,
      jiraProject,
    },
  };
}

export async function publishConfluencePlaybook(rawPayload) {
  const input = extractPayload(rawPayload);
  const city = cleanString(input.city, "Radom");
  const industryKey = normalizeIndustry(input.industry);
  const baseline = INDUSTRY_BASELINES[industryKey];
  const baseTitle = cleanString(
    input.title,
    `Northstar Ops Playbook: ${city} (${industryKey})`,
  );
  const summary = cleanString(
    input.summary,
    `Regional pricing and expansion strategy for ${city} in ${baseline.label}.`,
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
    <p><strong>City / Region:</strong> ${escapeHtml(city)} (Coverage radius: ${baseline.targetRadiusKm} km)<br/>
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
  const projectKey = cleanString(
    input.projectKey,
    DEFAULT_JIRA_PROJECT_KEY,
  ).toUpperCase();
  const city = cleanString(input.city, "Radom");
  const industryKey = normalizeIndustry(input.industry);
  const campaignTitle = cleanString(
    input.campaignTitle,
    `Northstar Ops Expansion — ${city} (${industryKey})`,
  );

  const projRes = await api
    .asUser()
    .requestJira(route`/rest/api/3/project/${projectKey}`, {
      headers: { Accept: "application/json" },
    });

  if (!projRes.ok) {
    const errText = await projRes.text();
    throw new Error(
      `Jira project "${projectKey}" lookup failed (${projRes.status}): ${errText.slice(0, 200)}`,
    );
  }

  const projectData = await projRes.json();
  const validIssueTypes = Array.isArray(projectData?.issueTypes)
    ? projectData.issueTypes.filter((t) => !t.subtask)
    : [];

  const chosenType =
    validIssueTypes.find((t) =>
      /^(task|zadanie|story|historia)$/i.test(t.name),
    ) || validIssueTypes[0];

  if (!chosenType) {
    throw new Error(
      `No usable standard issue type found in Jira project "${projectKey}".`,
    );
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
    const issueRes = await api.asUser().requestJira(route`/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary,
          issuetype: { id: chosenType.id },
          description: buildAdfDocument([
            `Campaign: ${campaignTitle}`,
            `Market: ${city} | Industry: ${industryKey}`,
            `Action item: ${taskText}`,
            "Generated automatically by Northstar Ops Geo Strategist (Atlassian Rovo + Forge).",
          ]),
        },
      }),
    });

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
    ok: createdIssues.length > 0,
    projectKey,
    issueTypeUsed: chosenType.name,
    campaignTitle,
    createdCount: createdIssues.length,
    createdIssues,
    failedIssues,
  };
}
