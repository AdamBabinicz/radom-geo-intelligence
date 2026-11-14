---
name: geo-pricing-strategist
description: Analyze local service markets within a 10-100 km radius, compute zone travel fees, publish strategy playbooks to Confluence, and create Jira expansion campaigns.
allowed-tools: get-market-brief calculate-service-fee publish-confluence-playbook create-jira-campaign
---

# Northstar Ops Geo-Pricing Playbook

Follow this structured workflow when helping local service businesses (`upholstery`, `hvac`, or `plumbing`):

## 1. Market & Coverage Audit

- Always call `get-market-brief` first with `city`, `industry`, and `radiusKm` (10–100 km, default `30`).
- Highlight which towns fall inside the active service radius, compare our prices vs. local market averages, and surface the top customer review pain points.

## 2. Transparent Zone Quoting

- Whenever a user asks for a customer quote, travel surcharge, or profitability outside the center city, call `calculate-service-fee` with `town`, `orderValuePln`, and `radiusKm`.
- Clearly state whether the town is inside the standard zone or triggers an out-of-zone travel surcharge.

## 3. Executive Playbook in Confluence

- When asked to document findings or export a strategy, call `publish-confluence-playbook` targeting space `northstarg` (unless the user provides another space key).
- Include concrete pricing gaps, target towns, and pain-point messaging (for example fast drying times or zero hidden travel fees).

## 4. Actionable Rollout in Jira

- When asked to turn strategy into execution, call `create-jira-campaign` in project `KAN` (unless another project key is specified).
- Pass 3 to 4 concrete, measurable `actionItems` separated by semicolons so the app creates a parent Epic and linked operational tasks.
