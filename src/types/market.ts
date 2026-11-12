export type Town = 'Radom' | 'Pionki' | 'Szydłowiec' | 'Skaryszew' | 'Jedlińsk' | 'Wierzbica' | 'Iłża' | 'Kozienice'

export interface CompetitorAnalysisInput {
  center: string
  radiusKm: number
}

export interface CompetitorInsight {
  service: string
  averagePricePln: number
  reviewPainPoints: Array<{ topic: string; mentions: number }>
  sourceStatus: 'demo' | 'connected'
}

export interface ServiceFeeInput {
  town: Town
  orderValue: number
}

export interface ServiceFeeQuote {
  town: Town
  orderValue: number
  travelFeePln: number
  totalPln: number
  sourceStatus: 'demo' | 'connected'
}

export interface CampaignSpec {
  season: string
  targetTowns: Town[]
  headline: string
  audience: string
  offer: string
  confluencePageTitle: string
  sourceStatus: 'draft' | 'published'
}
