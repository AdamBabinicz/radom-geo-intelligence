import { analyzeCompetitors, calculateServiceFee, generateLocalizedCampaign } from '../index'
import type { Town } from '../../types/market'

export const mcpTools = [
  { name: 'analyzeCompetitors', description: 'Analyze competitor prices and review pain points within a local service radius.', inputSchema: { type: 'object', properties: { center: { type: 'string' }, radiusKm: { type: 'number' } }, required: ['center', 'radiusKm'] } },
  { name: 'calculateServiceFee', description: 'Estimate a service travel fee for a supported town.', inputSchema: { type: 'object', properties: { town: { type: 'string', enum: ['Radom', 'Pionki', 'Szydłowiec', 'Skaryszew', 'Jedlińsk', 'Wierzbica', 'Iłża', 'Kozienice'] }, orderValue: { type: 'number' } }, required: ['town', 'orderValue'] } },
  { name: 'generateLocalizedCampaign', description: 'Prepare a localized marketing campaign brief for Confluence.', inputSchema: { type: 'object', properties: { season: { type: 'string' }, targetTowns: { type: 'array', items: { type: 'string' } } }, required: ['season', 'targetTowns'] } },
] as const

export async function callMcpTool(name: string, args: Record<string, unknown>) {
  if (name === 'analyzeCompetitors') return analyzeCompetitors({ center: String(args.center ?? ''), radiusKm: Number(args.radiusKm) })
  if (name === 'calculateServiceFee') return calculateServiceFee({ town: args.town as Town, orderValue: Number(args.orderValue) })
  if (name === 'generateLocalizedCampaign') return generateLocalizedCampaign({ season: String(args.season ?? ''), targetTowns: args.targetTowns as Town[] })
  throw new Error(`Unknown MCP tool: ${name}`)
}
