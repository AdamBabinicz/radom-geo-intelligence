---
name: geo-pricing-strategist
description: Analyze local service markets within a 10-100 km radius, read live Jira/Confluence workspace context, compute multi-currency zone travel fees, publish strategy playbooks to Confluence, and create Jira expansion campaigns.
allowed-tools: get-market-brief calculate-service-fee publish-confluence-playbook create-jira-campaign
---

# Northstar Ops Geo-Pricing Playbook

Follow this structured workflow when helping any local service business (`upholstery`, `hvac`, `plumbing`, or any custom service niche):

## 1. Market, Workspace Context & Coverage Audit

- Always call `get-market-brief` first with `city`, `industry`, `radiusKm` (`10–100`, default `30`), and optional `currency` (`PLN`, `USD`, `EUR`, `GBP`).
- Highlight serviceable towns inside the active radius, compare pricing benchmarks (when a preset matches) or custom niche scope, surface top customer pain points, and reference recent Jira issues/quotes or Confluence strategy pages already in the workspace.

## 2. Transparent Multi-Currency Zone Quoting

- Whenever a user asks for a customer quote, travel surcharge, or profitability outside the center city, call `calculate-service-fee` with `town`, `orderValue`, `radiusKm`, optional `distanceKm`, and optional `currency` (`PLN`, `USD`, `EUR`, `GBP`).
- Clearly state drive-time estimate, travel fee, total quote, and whether the town is inside the standard zone or triggers an out-of-zone surcharge.

## 3. Executive Playbook in Confluence

- When asked to document findings or export a strategy, call `publish-confluence-playbook` targeting space `northstarg` (unless the user provides another `spaceKey`), passing `city`, `industry`, `radiusKm`, optional `currency`, and a concise `summary`.
- Include concrete pricing moves, target towns, and pain-point messaging (such as transparent zone fees or fast turnaround times).

## 4. Actionable Rollout in Jira

- When asked to turn strategy into execution, call `create-jira-campaign` in project `KAN` (unless another `projectKey` is specified).
- Pass 3 to 4 concrete, measurable `actionItems` separated by semicolons so the app creates a parent Epic and linked operational tasks.
