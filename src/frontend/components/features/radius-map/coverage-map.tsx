import { MapPin, Navigation2 } from 'lucide-react'
import type { IntelligenceDictionary } from '@/src/locales'
import { CityRadiusControl } from '../../shared/city-radius-control'

type MarketStats = { towns: number; competitors: number }
type CoverageMapProps = {
  t: IntelligenceDictionary
  city: string
  radiusKm: number
  stats: MarketStats
  onCityChange: (city: string) => void
  onRadiusChange: (radius: number) => void
}

export function CoverageMap({ t, city, radiusKm, stats, onCityChange, onRadiusChange }: CoverageMapProps) {
  const sampleTowns = [t.sampleTown1, t.sampleTown2, t.sampleTown3, t.sampleTown4, t.sampleTown5, t.sampleTown6, t.sampleTown7]
  const townCount = Math.min(stats.towns - 1, sampleTowns.length)
  const isRadom = city.toLocaleLowerCase() === t.cityRadom.toLocaleLowerCase()
  const towns = Array.from({ length: townCount }, (_, index) => isRadom ? sampleTowns[index] : t.nearbyArea.replace('{index}', String(index + 1)))
  const additionalCount = Math.max(0, stats.towns - 1 - towns.length)
  const coordinates = ['left-[25%] top-[28%]', 'left-[19%] top-[59%]', 'left-[64%] top-[68%]', 'left-[66%] top-[27%]', 'left-[39%] top-[79%]', 'left-[76%] top-[49%]', 'left-[43%] top-[15%]']
  return <section id="coverage" className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#172123]"><div className="p-5 pb-3"><h2 className="text-sm font-semibold">{t.coverageTitle}</h2><p className="mt-1 text-[11px] text-slate-500">{t.coverageSubtitle.replace('{city}', city).replace('{radius}', String(radiusKm))}</p></div>
    <div className="px-5 pb-3"><CityRadiusControl t={t} city={city} radiusKm={radiusKm} cityListId="coverage-cities" onCityChange={onCityChange} onRadiusChange={onRadiusChange}/></div>
    <div className="relative mx-4 mb-4 h-[268px] overflow-hidden rounded-lg border border-[#dae7e3] bg-[#eaf1ed] dark:border-slate-700 dark:bg-[#1c2b2a]"><div className="absolute inset-0 opacity-45 [background-image:linear-gradient(33deg,transparent_47%,#c4d6cf_48%,#c4d6cf_49%,transparent_50%),linear-gradient(122deg,transparent_46%,#c4d6cf_47%,#c4d6cf_48%,transparent_49%),linear-gradient(90deg,transparent_48%,#d0ded8_49%,#d0ded8_50%,transparent_51%)] [background-size:130px_110px,180px_145px,90px_100%] dark:opacity-20"/><svg aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 size-[280px] -translate-x-1/2 -translate-y-1/2 overflow-visible" viewBox="0 0 300 300"><circle cx="150" cy="150" r={65 + radiusKm * 0.8} strokeDasharray="5 5" strokeWidth="1" className="fill-teal-500/[.08] stroke-teal-700/50 transition-all duration-300 ease-out dark:fill-teal-300/[.07] dark:stroke-teal-300/50"/></svg><div className="absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-white bg-teal-700 text-white shadow-lg dark:border-slate-800"><MapPin size={17}/></div><div className="absolute left-[calc(50%+13px)] top-[calc(50%+24px)] rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 shadow-sm dark:bg-slate-900/90 dark:text-slate-100">{city}</div>
      {towns.map((town, index) => <div key={town} className={`absolute ${coordinates[index]}`}><span className="block size-2 rounded-full border border-white bg-teal-600 shadow dark:border-slate-800"/><span className="mt-1 block whitespace-nowrap text-[9px] font-medium text-slate-600 dark:text-slate-300">{town}</span></div>)}
      <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[9px] text-slate-600 shadow-sm dark:bg-slate-900/90 dark:text-slate-300"><Navigation2 size={11}/>{t.coverageLegend}</div><div className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[9px] font-medium text-teal-800 shadow-sm dark:bg-slate-900/90 dark:text-teal-300">{t.radiusBoundary.replace('{radius}', String(radiusKm))}</div>
    </div><div className="flex flex-wrap gap-1.5 px-5 pb-5">{towns.slice(0, 5).map((town) => <span key={town} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{town}</span>)}{additionalCount > 0 && <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-300">+{additionalCount} {t.more}</span>}</div></section>
}
