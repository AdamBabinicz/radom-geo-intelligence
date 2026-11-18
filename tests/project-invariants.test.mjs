import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function readUtf8(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function listFilesRecursive(dirRel, extensions) {
  const startDir = path.join(ROOT, dirRel);
  if (!fs.existsSync(startDir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(startDir, { withFileTypes: true })) {
    const rel = path.posix.join(dirRel.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(rel, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(rel);
    }
  }
  return results;
}

test("i18n dictionaries maintain 100% EN/PL key parity with non-empty values", () => {
  const enDir = path.join(ROOT, "src", "locales", "en");
  const plDir = path.join(ROOT, "src", "locales", "pl");
  const enFiles = fs
    .readdirSync(enDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const plFiles = fs
    .readdirSync(plDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  assert.deepEqual(enFiles, plFiles, "Locale file lists (en vs pl) must match");
  assert.ok(enFiles.length >= 5, "Expected at least 5 locale namespaces");

  for (const file of enFiles) {
    const enObj = JSON.parse(fs.readFileSync(path.join(enDir, file), "utf8"));
    const plObj = JSON.parse(fs.readFileSync(path.join(plDir, file), "utf8"));

    const enKeys = Object.keys(enObj).sort();
    const plKeys = Object.keys(plObj).sort();
    assert.deepEqual(enKeys, plKeys, `Key mismatch in locale file ${file}`);

    for (const key of enKeys) {
      assert.equal(
        typeof enObj[key],
        "string",
        `en/${file}:${key} must be a string`,
      );
      assert.equal(
        typeof plObj[key],
        "string",
        `pl/${file}:${key} must be a string`,
      );
      assert.ok(
        enObj[key].trim().length > 0,
        `en/${file}:${key} cannot be empty`,
      );
      assert.ok(
        plObj[key].trim().length > 0,
        `pl/${file}:${key} cannot be empty`,
      );
    }
  }
});

test("UI components contain zero inline style={{...}} attributes", () => {
  const tsxFiles = [
    ...listFilesRecursive("app", [".tsx"]),
    ...listFilesRecursive("src", [".tsx"]),
    ...listFilesRecursive("components", [".tsx"]),
  ].filter((rel) => rel !== "app/opengraph-image.tsx");

  assert.ok(tsxFiles.length > 0, "Expected TSX files to inspect");

  for (const rel of tsxFiles) {
    const content = readUtf8(rel);
    assert.equal(
      /style=\{\{/.test(content),
      false,
      `Forbidden inline style={{...}} detected in ${rel}`,
    );
  }
});

test("TypeScript strict build is preserved (no ignoreBuildErrors)", () => {
  const nextConfig = readUtf8("next.config.mjs");
  assert.equal(
    /ignoreBuildErrors\s*:\s*true/.test(nextConfig),
    false,
    "next.config.mjs must not enable ignoreBuildErrors",
  );
});

test("Web MCP tools match llms.txt and support global town/distance quoting", () => {
  const toolsSource = readUtf8("src/backend/mcp-server/tools.ts");
  const backendSource = readUtf8("src/backend/index.ts");
  const llmsTxt = readUtf8("public/llms.txt");

  const expectedTools = [
    "analyzeCompetitors",
    "calculateServiceFee",
    "generateLocalizedCampaign",
    "exportStrategyToConfluence",
    "createJiraMarketingEpics",
    "createCustomerQuote",
  ];

  for (const toolName of expectedTools) {
    assert.ok(
      toolsSource.includes(`name: "${toolName}"`),
      `Missing MCP tool definition: ${toolName}`,
    );
    assert.ok(
      llmsTxt.includes(toolName),
      `Missing MCP tool documentation in public/llms.txt: ${toolName}`,
    );
  }

  assert.equal(
    backendSource.includes("SUPPORTED_TOWNS"),
    false,
    "calculateServiceFee must not restrict towns to a hardcoded Radom list",
  );
  assert.ok(
    toolsSource.includes("distanceKm"),
    "calculateServiceFee MCP schema should expose optional distanceKm",
  );
});

test("Forge Rovo app maintains Runs on Atlassian zero-egress and manifest parity", () => {
  const pkg = JSON.parse(readUtf8("northstar-ops-rovo/package.json"));
  const manifest = readUtf8("northstar-ops-rovo/manifest.yml");
  const skill = readUtf8(
    "northstar-ops-rovo/skills/geo-pricing-strategist/SKILL.md",
  );
  const handler = readUtf8("northstar-ops-rovo/src/index.js");

  assert.equal(pkg.name, "northstar-ops-rovo");
  assert.ok(
    manifest.includes("rovo:agent:"),
    "manifest.yml must declare rovo:agent",
  );
  assert.ok(
    manifest.includes("rovo:skill:"),
    "manifest.yml must declare rovo:skill",
  );
  assert.ok(
    manifest.includes("rovo:mcp:"),
    "manifest.yml must declare rovo:mcp",
  );
  assert.equal(
    /^\s*external:/m.test(manifest),
    false,
    "Forge manifest must declare zero external egress for Runs on Atlassian eligibility",
  );
  assert.equal(
    /\bfetch\s*\(/.test(handler),
    false,
    "Forge handler must not call external fetch() directly",
  );

  const expectedActions = [
    "get-market-brief",
    "calculate-service-fee",
    "publish-confluence-playbook",
    "create-jira-campaign",
  ];
  for (const actionKey of expectedActions) {
    assert.ok(
      manifest.includes(`key: ${actionKey}`),
      `Missing Forge action ${actionKey}`,
    );
    assert.ok(
      skill.includes(actionKey),
      `Missing action ${actionKey} in SKILL.md`,
    );
  }

  const expectedFns = [
    "getMarketBrief",
    "calculateServiceFee",
    "publishConfluencePlaybook",
    "createJiraCampaign",
  ];
  for (const fn of expectedFns) {
    assert.ok(
      handler.includes(`export async function ${fn}`),
      `Missing exported Forge handler function ${fn}`,
    );
  }
});
