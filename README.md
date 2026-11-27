# Northstar Ops — GeoIntelligence & Service Operations Hub

> Parameterized Geo-Intelligence platform, Multi-Model AI Strategy Council, native Jira UI Kit dashboard, and Atlassian Forge Rovo + MCP ecosystem for local field-service operators.

[![Live Production](https://img.shields.io/badge/Live_App-nsops.vercel.app-0d9488?style=flat-square)](https://nsops.vercel.app)
[![Demo Video](<https://img.shields.io/badge/Demo_Video-YouTube_(4:01)-dc2626?style=flat-square&logo=youtube&logoColor=white>)](https://youtu.be/829W7ZoTmKs)
[![Atlassian Forge](https://img.shields.io/badge/Atlassian_Forge-Runs_on_Atlassian-0052cc?style=flat-square)](https://developer.atlassian.com/platform/forge/)
[![MCP JSON-RPC 2.0](https://img.shields.io/badge/Protocol-MCP_JSON--RPC_2.0-1e293b?style=flat-square)](https://nsops.vercel.app/api/mcp)
[![Next.js 16.4](https://img.shields.io/badge/Next.js-16.4.6-000000?style=flat-square)](https://nextjs.org)

- **Live Web Application:** https://nsops.vercel.app
- **Demo Video (4:01, EN narrated + subtitles):** https://youtu.be/829W7ZoTmKs
- **Web MCP Discovery & `llms.txt`:** https://nsops.vercel.app/api/mcp · https://nsops.vercel.app/llms.txt
- **Privacy Policy & Terms:** https://nsops.vercel.app/privacy · https://nsops.vercel.app/terms
- **Forge App ID:** `ari:cloud:ecosystem::app/0f3e249d-8d6d-42b2-a2a8-dc3aa49696d0` (`Runs on Atlassian` eligible — zero external egress)

---

## 1. The Real-World Problem & Live Business Validation

Local field-service businesses (upholstery and carpet cleaning, HVAC, plumbing, event & detailing services) rarely lose customers because of poor craft—they lose margin and leads because of **fragmented pricing intelligence and manual Jira/Confluence coordination**:

- Competitors hide prices inside React/Vite SPA bundles, `/cennik` subpages, or unstructured Google Business listings.
- Operators underprice core services or absorb out-of-zone fuel and travel costs without transparent distance rules.
- Insights discovered in ad-hoc spreadsheets never turn into structured Confluence playbooks or actionable Jira marketing epics.

**Northstar Ops** solves this end-to-end. Rather than relying on synthetic mockups, it is validated against a **live regional operator case study** for [**SUPER PUCUŚ**](https://pranie-dywanow.j.pl/) (upholstery & carpet extraction in **Radom, Poland**, `10–100 km` service radius with real OpenStreetMap towns including Pionki, Jedlińsk, Przytyk, and Wierzbica), while remaining **100% parameterized** for any city worldwide, any custom service niche, `PLN / USD / EUR / GBP` currencies decoupled from UI language, and any public website URL.

---

## 2. Architecture Overview

Northstar Ops combines two synchronized layers: a **parameterized Next.js Intelligence Hub** and a **native Atlassian Forge UI Kit + Rovo + MCP App (`northstar-ops-rovo/`)** eligible for **Runs on Atlassian**.

```mermaid
flowchart LR
  subgraph WEB["Web Geo-Intelligence Hub (Next.js 16 · nsops.vercel.app)"]
    direction TB
    W1["Geo Radar & OSM Resolver<br/>/api/geo/resolve · 10–100 km Global Coverage"]
    W2["SPA Price & Competitor Sync<br/>SSRF Guard · Live HTML/JS + Serper / OSM"]
    W3["Multi-Model AI Strategy Council<br/>Strategist ↔ Critic + Deterministic Measure + HITL"]
    W4["Open Web MCP Gateway<br/>/api/mcp JSON-RPC 2.0 · /llms.txt"]
  end

  subgraph FORGE["Atlassian Forge App (Runs on Atlassian · Zero Egress)"]
    direction TB
    F1["Native Jira Project UI Kit<br/>jira:projectPage · @forge/react · EN/PL & Free Plan"]
    F2["Rovo Agent & Skill<br/>Northstar Ops Geo Strategist · SKILL.md"]
    F3["Forge MCP & 4 Actions<br/>Brief · Zone Quote · Playbook · Jira Epic"]
  end

  subgraph OUT["Atlassian Cloud Outputs (api.asUser)"]
    direction TB
    O1["Jira Epics & Quotes<br/>Campaign Tasks & Quote Tickets"]
    O2["Confluence Playbooks<br/>Audit-Ready Strategy Docs"]
  end

  WEB -->|"Jira REST v3"| FORGE
  WEB -->|"Confluence REST v2"| FORGE
  FORGE --> O1
  FORGE --> O2

  style WEB fill:transparent,stroke:#64748b,stroke-width:2px,stroke-dasharray: 5 5
  style FORGE fill:transparent,stroke:#2563eb,stroke-width:2px,stroke-dasharray: 5 5
  style OUT fill:transparent,stroke:#0d9488,stroke-width:2px,stroke-dasharray: 5 5

  classDef webNode fill:#1e293b,stroke:#475569,stroke-width:1.5px,color:#f8fafc
  classDef forgeNode fill:#0052cc,stroke:#3b82f6,stroke-width:1.5px,color:#ffffff
  classDef outNode fill:#0f766e,stroke:#14b8a6,stroke-width:1.5px,color:#ffffff

  class W1,W2,W3,W4 webNode
  class F1,F2,F3 forgeNode
  class O1,O2 outNode
```

| Layer               | Component                       | Endpoint / Module                       | Security & Fallbacks                                                                               |
| :------------------ | :------------------------------ | :-------------------------------------- | :------------------------------------------------------------------------------------------------- |
| **Web Geo Hub**     | Geo Radar & OSM Resolver        | `/api/geo/resolve`                      | OpenStreetMap Nominatim + Overpass + Wikidata race                                                 |
| **Web Geo Hub**     | SPA Price & Competitor Sync     | `/api/pricing/sync`, `/api/market/scan` | SSRF guard; Serper.dev with DuckDuckGo/OSM + deterministic parser fallback                         |
| **Web Geo Hub**     | Multi-Model AI Strategy Council | `/api/council`                          | Cross-provider Strategist ↔ Critic (`429` failover) + deterministic `Measure` guardrails + HITL    |
| **Web Geo Hub**     | Open Web MCP Gateway            | `/api/mcp`, `/llms.txt`                 | JSON-RPC 2.0 discovery & 6 parameterized tools (`distanceKm` & `currency` support)                 |
| **Atlassian Forge** | Native Jira Project UI Kit      | `jira:projectPage` (`@forge/react`)     | `Runs on Atlassian` zero-egress (`nodejs24.x`, `api.asUser()`), works on Jira Free                 |
| **Atlassian Forge** | Rovo Agent & Skill              | `rovo:agent` + `rovo:skill`             | `Northstar Ops Geo Strategist` + `SKILL.md` operational playbook                                   |
| **Atlassian Forge** | Forge MCP & 4 Actions           | `rovo:mcp` + 4 Forge functions          | `get-market-brief`, `calculate-service-fee`, `publish-confluence-playbook`, `create-jira-campaign` |

---

## 3. Core Capabilities

### A. Global Geo-Intelligence & Interactive Coverage Map

- **Any City Worldwide:** Resolves coordinates and surrounding towns within `10–100 km` using OpenStreetMap Nominatim, Overpass API, and Wikidata SPARQL races (`/api/geo/resolve`).
- **Interactive SVG Coverage Radar:** Smooth zoom (`+ / − / Reset` up to `5.5x`), dynamic `10–100 km` radius slider synced with KPI cards, keyboard-accessible town pins, and straight-line distance + drive-time estimations with `cos(lat)` projection correction.
- **Decoupled Language & Currency (`PL / EN` × `PLN / USD / EUR / GBP`):** Strict i18n dictionaries (`src/locales/pl|en/*.json`) are independent from display currency—operators in Radom can inspect the dashboard in English while keeping native `PLN` rates, or auto-switch currency (`EUR`, `GBP`, `USD`, `PLN`) when analyzing foreign cities or selecting an override in the header.

### B. Universal SPA Price Sync & Live Competitor Discovery

- **Live Website Pricing Sync (`/api/pricing/sync`):** Extracts service menus from static HTML, JSON-LD, client-side React/Vite JS bundles, and `/cennik` subpages, normalized into structured service units (`m²`, `pcs`). Includes SSRF protection and deterministic fallback parsing.
- **Competitor & Pain-Point Scanner (`/api/market/scan`):** Discovers real local competitors via Google Maps & Google Search (`Serper.dev`, with DuckDuckGo/OSM fallback), filters out lead-gen aggregators, compares market averages per service, and extracts verified customer review pain points.

### C. Cross-Provider Multi-Model AI Strategy Council (`Measure` + `HITL`)

Pricing decisions never rely on a single unchallenged LLM prompt:

1. **Round 1 — Strategist:** Proposes concrete pricing moves grounded in live competitor averages and customer pain points.
2. **Round 2 — Independent Critic (Cross-Provider, Fresh Context):** Runs in an isolated session on a different model/provider family (Gemini ↔ Groq `openai/gpt-oss-120b` / `qwen/qwen3.8-27b` or OpenAI) to challenge margin/churn risks, calculate a `riskScore`, and examine operator limits.
3. **Round 3 — Moderator Synthesis & Deterministic `Measure` Guardrail:** Produces two distinct go-to-market options (**Option A** vs **Option B**) and runs `measureAndEnforceCouncilPolicy` before approval—deterministically enforcing `positive_price`, `max_step_pct` bounds (`0.60×–1.65×`), and EN/PL numeric `human_cap` / `human_floor` constraints parsed from operator notes and saved Lessons Learned.
4. **Human-in-the-Loop & Lessons Learned:** Operators review invariant check counts (`checksPassed/checksTotal`), inspect enforced corrections, and persist approved governance rules in browser `localStorage`.
5. **Direct Atlassian Execution:** Clicking **Approve choice & push to Atlassian** sends the approved `councilContext` (selected option, AI audit trail, critic warnings, `policyMeasurement` summary, and action items) straight to Confluence and Jira.

### D. Native Atlassian Forge App (`northstar-ops-rovo/`)

- **Runtime:** `nodejs24.x`, `arm64`, `256 MB`, zero external egress (**Runs on Atlassian** compliant).
- **Modules in `northstar-ops-rovo/manifest.yml`:**
  - `jira:projectPage`: `northstar-ops-jira-page` (_Northstar Ops_, `render: native` UI Kit via `@forge/react`, `@forge/resolver`, and `@forge/bridge`) — embeds live Jira issues (`/rest/api/3/search/jql`), live Confluence pages, `EN / PL` UI switch, custom or preset industries, `10–100 km` radius, `PLN / USD / EUR / GBP` currency switching, a zone quote calculator that creates Jira quote tickets, and one-click Confluence playbook publishing & Jira campaign creation directly inside any Jira project (including Jira Cloud Free plans without a Rovo Chat button).
  - `rovo:agent`: `northstar-ops-geo-strategist` (_Northstar Ops Geo Strategist_)
  - `rovo:skill`: `geo-pricing-strategist` (`skills/geo-pricing-strategist/SKILL.md`)
  - `rovo:mcp`: `northstar-ops-mcp` (_Northstar Ops MCP Server_)
  - `action` + `function`:
    - `get-market-brief` (`GET`) — Regional benchmarks (`PLN/USD/EUR/GBP`), preset or custom industry support, radius coverage (`10–100 km`), customer pain points, and live Jira + Confluence workspace context
    - `calculate-service-fee` (`GET`) — Global zone travel fee, drive-time estimate, and total customer quote calculator for any town and `distanceKm`
    - `publish-confluence-playbook` (`CREATE`) — Creates a formatted strategy playbook page in Confluence
    - `create-jira-campaign` (`CREATE`) — Creates a parent Jira Epic + linked execution tasks
- **Scopes:** `read:space:confluence`, `read:page:confluence`, `write:page:confluence`, `read:jira-work`, `write:jira-work`

### E. Open Web MCP Endpoint (`/api/mcp` & `/llms.txt`)

In addition to the Forge MCP server (`rovo:mcp`), the web hub exposes a full **MCP JSON-RPC 2.0** endpoint at `POST /api/mcp` (discoverable via `GET /api/mcp` and `/llms.txt`) with 6 global tools:

1. `analyzeCompetitors` _(supports live OpenStreetMap Overpass town discovery for any city worldwide and optional `currency`)_
2. `calculateServiceFee` _(supports any global city/town and optional `distanceKm`)_
3. `generateLocalizedCampaign`
4. `exportStrategyToConfluence` _(accepts `currency` and `councilContext` including `policyMeasurement`)_
5. `createJiraMarketingEpics` _(accepts `currency` and `councilContext`)_
6. `createCustomerQuote` _(creates a live Jira lead/quote task directly from Customer Price Preview in the selected `currency`)_

Example JSON-RPC call:

```bash
curl -X POST https://nsops.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "calculateServiceFee",
      "arguments": { "town": "Pionki", "orderValue": 250, "distanceKm": 22 }
    }
  }'
```

---

## 4. Tech Stack

- **Web Framework:** Next.js `16.4.6` (App Router, Turbopack), React `19`, TypeScript `5.7.3` (strict)
- **Styling & UI:** Tailwind CSS v4 (`@tailwindcss/postcss`), shadcn/ui (`button`), `lucide-react`, `Plus Jakarta Sans` & `JetBrains Mono`
- **AI & Search:** `@google/genai`, Groq OpenAI-compatible fallback chain (`openai/gpt-oss-120b` → `qwen/qwen3.8-27b` → `openai/gpt-oss-20b`), optional OpenAI fallback, Serper.dev Google Search & Maps, OpenStreetMap + Wikidata
- **Atlassian Platform:** Atlassian Forge CLI, `@forge/api ^8.5.0`, `@forge/react ^12.5.0`, `@forge/resolver ^2.0.2`, `@forge/bridge`, Confluence REST API v2, Jira REST API v3, UI Kit `jira:projectPage`, Rovo Agent, Rovo Skill, Rovo MCP Server
- **Testing & Verification:** Node.js built-in test runner (`node --test tests/*.test.mjs`) + strict TypeScript (`tsc --noEmit`)
- **Package Manager:** `pnpm` (root web app) · `npm` (`northstar-ops-rovo/` Forge bundle)

---

## 5. Repository Structure

```text
.
├── app/
│   ├── api/
│   │   ├── council/route.ts         # 3-round cross-provider AI Strategy Council + Measure guardrails
│   │   ├── geo/resolve/route.ts     # Global city + radius town resolver (OSM + Wikidata)
│   │   ├── market/scan/route.ts     # Live competitor & customer pain-point scanner
│   │   ├── mcp/route.ts             # Web MCP JSON-RPC 2.0 endpoint
│   │   └── pricing/sync/route.ts    # SSRF-safe HTML/JSON-LD/SPA price extractor
│   ├── opengraph-image.tsx          # Dynamic 1200x630 OpenGraph & Twitter card
│   ├── privacy/page.tsx             # GDPR/RODO privacy notice
│   ├── terms/page.tsx               # Terms of service
│   ├── robots.ts & sitemap.ts       # Search & AI crawler metadata
│   └── layout.tsx & page.tsx        # Root App Router entry & JSON-LD schema
├── northstar-ops-rovo/              # Native Atlassian Forge UI Kit + Rovo + MCP app (Runs on Atlassian)
│   ├── manifest.yml                 # jira:projectPage, rovo:agent, rovo:skill, rovo:mcp, actions & scopes
│   ├── skills/geo-pricing-strategist/SKILL.md
│   └── src/
│       ├── index.js                 # Forge Rovo handlers & UI Kit resolver (Jira v3 & Confluence v2)
│       └── frontend/index.jsx       # Native Atlassian UI Kit Jira projectPage (EN/PL, tokens)
├── public/
│   ├── llms.txt                     # Machine-readable AI discovery specification
│   └── site.webmanifest             # PWA manifest & custom Northstar Ops icons
├── tests/
│   ├── business-logic.test.mjs      # Unit tests: Haversine geo-math, zone pricing, currency & industry resolvers
│   └── project-invariants.test.mjs  # Automated architectural, i18n, MCP & Forge parity tests
└── src/
    ├── backend/
    │   ├── ai/                      # Gemini client, modular multi-provider AI Council & Measure policy engine
    │   ├── market-scan/             # Live competitor discovery, crawler & report synthesizer
    │   ├── mcp-server/              # Parameterized Web MCP JSON-RPC tool definitions
    │   ├── operations/              # Atlassian REST v2/v3 client, Confluence & Jira publishers
    │   └── pricing-sync/            # SSRF-guarded HTML/JSON-LD/SPA extractor & service rules
    ├── config/                      # Parameterized industry templates & market geo math
    ├── frontend/components/
    │   ├── dashboard/               # Shell, KPI grid & live intelligence state hook
    │   └── features/                # AI Council, competitor table, GIS SVG map, calculator, Rovo & legal UI
    ├── lib/                         # Haversine distance, cos(lat) projection math & decoupled currency formatting
    ├── locales/                     # Strict EN & PL i18n JSON dictionaries (100% key parity)
    └── types/                       # Shared market, pricing, council & Atlassian DTOs
```

---

## 6. Local Development & Deployment

### Prerequisites

- Node.js `22+` or `24+`
- `pnpm` (`npx pnpm` works out of the box via Corepack)
- Atlassian Forge CLI (`npx @forge/cli`) for deploying `northstar-ops-rovo/`

### 1. Run & Verify the Next.js Web Hub

```bash
npx pnpm install
cp .env.example .env.local
```

Fill in `.env.local` (never commit secrets):

| Variable                         | Required        | Purpose                                                              |
| -------------------------------- | --------------- | -------------------------------------------------------------------- |
| `GEMINI_API_KEY`                 | Recommended     | Primary AI extractor, market structurer & Council Strategist         |
| `GROQ_API_KEY`                   | Recommended     | Cross-provider Devil's Advocate Critic & automatic 429 fallback      |
| `GROQ_TEXT_MODEL`                | Optional        | Custom Groq model override (defaults to `openai/gpt-oss-120b` chain) |
| `OPENAI_API_KEY`                 | Optional        | Alternative cross-provider Critic if Groq is unset                   |
| `SERPER_API_KEY`                 | Recommended     | Google Search & Google Maps competitor discovery                     |
| `ENABLE_GEMINI_SEARCH_GROUNDING` | Optional        | Set `"true"` to prioritize Gemini Search Grounding before Serper     |
| `NEXT_PUBLIC_SITE_URL`           | Optional        | Canonical URL for `robots.txt` & `sitemap.xml`                       |
| `ATLASSIAN_BASE_URL`             | For live export | Your Atlassian Cloud site (e.g. `https://your-site.atlassian.net`)   |
| `ATLASSIAN_EMAIL`                | For live export | Atlassian account email for REST API auth                            |
| `ATLASSIAN_API_TOKEN`            | For live export | Atlassian API token                                                  |
| `ATLASSIAN_CONFLUENCE_SPACE_KEY` | Optional        | Target Confluence space key (default: `northstarg`)                  |
| `ATLASSIAN_JIRA_PROJECT_KEY`     | Optional        | Target Jira project key (default: `KAN`)                             |

Verify types, invariants, and production build:

```bash
npx pnpm typecheck
npx pnpm test
npx pnpm build && npx pnpm start
```

### 2. Validate, Deploy & Test the Atlassian Forge App (`rovo:agent`, `rovo:mcp`, `jira:projectPage`)

```bash
cd northstar-ops-rovo
npm ci
npx @forge/cli lint
npx @forge/cli deploy -e production --non-interactive
npx @forge/cli install --non-interactive --site <your-site>.atlassian.net --product jira --environment production
npx @forge/cli install --non-interactive --site <your-site>.atlassian.net --product confluence --environment production
```

After installation:

- Open any Jira project sidebar and select **Northstar Ops** (`jira:projectPage`) to test native UI Kit quoting and Confluence/Jira publishing via `api.asUser()`.
- In Atlassian Rovo Chat or an MCP client connected to `northstar-ops-mcp` (`rovo:mcp`), invoke `get-market-brief` or `calculate-service-fee` to test live workspace-aware responses.

---

## 7. Automated Tests & Invariant Checks (`pnpm test`)

`node --test tests/*.test.mjs` (**10/10 passing**) guards both core geo-pricing domain logic (`tests/business-logic.test.mjs`) and architectural parity (`tests/project-invariants.test.mjs`):

### Unit & Business Logic Tests (`tests/business-logic.test.mjs` — 5 checks)

1. **Symmetric Haversine & `cos(lat)` Projections:** Verifies symmetric distance math and planar projection scaling across global coordinates.
2. **Zone Pricing & Drive-Time Monotonicity:** Ensures travel fees and drive-time tiers remain strictly monotonic across `0–100 km`.
3. **PLN/EN Currency Conversion & Formatting:** Validates exchange precision and `Intl.NumberFormat` output rules across locales.
4. **Decoupled Display Currency & Market Resolution:** Verifies that `resolveMarketCurrency`, `convertToPln`, `normalizeDisplayCurrency`, and `formatPrice(..., currencyOverride)` keep UI language independent from displayed pricing currency (`PLN`, `USD`, `EUR`, `GBP`).
5. **Industry Templates & Service Resolvers:** Verifies preset and custom dynamic industry matching and normalized service units.

### Architectural Invariant Checks (`tests/project-invariants.test.mjs` — 5 checks)

6. **100% EN/PL i18n Parity:** Ensures identical keys, placeholders, and non-empty strings across all `src/locales/en/*.json` and `src/locales/pl/*.json` namespaces.
7. **Zero Inline Styles:** Verifies zero `style={{...}}` attributes across Next.js TSX components and Forge UI Kit JSX sources.
8. **Strict TypeScript Build:** Confirms `next.config.mjs` never enables `ignoreBuildErrors: true`.
9. **Web MCP & `llms.txt` Parity:** Verifies all 6 MCP tools match `public/llms.txt` and support global `distanceKm` quoting without hardcoded town lists.
10. **Forge `Runs on Atlassian` & Manifest Parity:** Confirms zero `external:` egress permissions, zero `fetch()` calls inside Forge handlers/UI Kit, and full parity between `manifest.yml`, `SKILL.md`, `index.js`, and `src/frontend/index.jsx`.

---

## 8. Security, Privacy & Compliance

- **Zero Client Secret Exposure:** All AI keys, Serper tokens, and Atlassian API credentials remain strictly server-side.
- **SSRF Guarding:** `/api/pricing/sync` validates schemes and blocks loopback/private network ranges before fetching external websites.
- **Runs on Atlassian:** The `northstar-ops-rovo` Forge app performs zero external network egress and executes Confluence/Jira mutations via `api.asUser()`.
- **GDPR / Consent Mode v2:** Built-in bilingual cookie consent manager (`analytics_storage`, `ad_storage`) with persistent preferences and `/privacy` + `/terms` routes.

---

## License

Built for **Atlassian Codegeist 2026**. See repository metadata and legal notices in `/privacy` and `/terms`.
