import type { CampaignSpec, CompetitorAnalysisInput, CompetitorInsight, ServiceFeeInput, ServiceFeeQuote, Town } from '../types/market'

const towns: Town[] = ['Radom', 'Pionki', 'Szydłowiec', 'Skaryszew', 'Jedlińsk', 'Wierzbica', 'Iłża', 'Kozienice']
const travelFees: Record<Town, number> = { Radom: 0, Pionki: 20, Szydłowiec: 35, Skaryszew: 20, Jedlińsk: 25, Wierzbica: 30, Iłża: 35, Kozienice: 35 }

export async function analyzeCompetitors(input: CompetitorAnalysisInput): Promise<{ center: string; radiusKm: number; competitorsTracked: number; insights: CompetitorInsight[]; sourceStatus: 'demo' }> {
  if (!input.center.trim() || input.radiusKm <= 0 || input.radiusKm > 100) throw new Error('Invalid center or radius')
  return { center: input.center, radiusKm: input.radiusKm, competitorsTracked: 24, sourceStatus: 'demo', insights: [
    { service: 'Corner sofa', averagePricePln: 280, sourceStatus: 'demo', reviewPainPoints: [{ topic: 'Drying time', mentions: 38 }, { topic: 'Hidden fees', mentions: 31 }] },
    { service: 'Two-seat couch', averagePricePln: 190, sourceStatus: 'demo', reviewPainPoints: [{ topic: 'Punctuality', mentions: 19 }] },
  ] }
}

export function calculateServiceFee(input: ServiceFeeInput): ServiceFeeQuote {
  if (!towns.includes(input.town) || !Number.isFinite(input.orderValue) || input.orderValue < 0) throw new Error('Invalid service fee input')
  const travelFeePln = travelFees[input.town]
  return { town: input.town, orderValue: input.orderValue, travelFeePln, totalPln: input.orderValue + travelFeePln, sourceStatus: 'demo' }
}

export function generateLocalizedCampaign(input: { season: string; targetTowns: Town[] }): CampaignSpec {
  if (!input.season.trim() || !input.targetTowns.length || input.targetTowns.some((town) => !towns.includes(town))) throw new Error('Invalid campaign request')
  return { season: input.season, targetTowns: input.targetTowns, headline: `A fresher home this ${input.season}`, audience: 'Local households seeking professional upholstery and carpet care', offer: 'Transparent upfront pricing and clear drying-time guidance', confluencePageTitle: `${input.season} local service campaign — ${input.targetTowns.join(', ')}`, sourceStatus: 'draft' }
}

export const handler = async () => ({ status: 'ready', tools: ['analyzeCompetitors', 'calculateServiceFee', 'generateLocalizedCampaign'], note: 'Demo handlers; connect approved market data and Confluence publishing before production.' })
