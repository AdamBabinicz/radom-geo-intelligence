const cityDensity = new Map<string, number>([
  ['warsaw', 3.2], ['warszawa', 3.2], ['krakow', 2.6], ['kraków', 2.6],
  ['wroclaw', 2.3], ['wrocław', 2.3], ['gdansk', 1.9], ['gdańsk', 1.9],
  ['poznan', 2], ['poznań', 2], ['radom', 1],
])

export function getMarketStats(radiusKm: number, city: string) {
  const towns = Math.max(2, Math.round(8 * (radiusKm / 30) ** 1.2))
  const density = cityDensity.get(city.trim().toLocaleLowerCase()) ?? 1
  return { towns, competitors: Math.round(towns * 3 * density) }
}
