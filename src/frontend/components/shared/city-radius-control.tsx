'use client'

import type { IntelligenceDictionary } from '@/src/locales'

type CityRadiusControlProps = {
  t: IntelligenceDictionary
  city: string
  radiusKm: number
  cityListId: string
  onCityChange: (city: string) => void
  onRadiusChange: (radius: number) => void
}

export function CityRadiusControl({ t, city, radiusKm, cityListId, onCityChange, onRadiusChange }: CityRadiusControlProps) {
  const cities = [t.cityRadom, t.cityWarsaw, t.cityKrakow, t.cityGdansk, t.cityWroclaw, t.cityPoznan]
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40 sm:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)]">
      <label className="flex min-w-0 flex-col gap-1.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
        {t.citySelectorLabel}
        <input list={cityListId} value={city} onChange={(event) => onCityChange(event.target.value)} placeholder={t.citySelectorPlaceholder} title={t.citySelectorTooltip} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        <datalist id={cityListId}>{cities.map((option) => <option key={option} value={option} />)}</datalist>
      </label>
      <label className="flex min-w-0 flex-col gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
        <span className="flex items-center justify-between gap-2"><span>{t.radiusSliderLabel}</span><output htmlFor={`${cityListId}-radius`} className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-teal-800 dark:bg-slate-800 dark:text-teal-200">{t.radiusValue.replace('{radius}', String(radiusKm))}</output></span>
        <input id={`${cityListId}-radius`} type="range" min={10} max={100} step={1} value={radiusKm} onChange={(event) => onRadiusChange(Number(event.target.value))} aria-label={t.radiusSliderLabel} title={t.radiusSliderTooltip} className="h-4 w-full cursor-pointer accent-teal-700" />
        <span className="flex justify-between text-[9px] font-normal text-slate-400"><span>{t.radiusMinimum}</span><span>{t.radiusMaximum}</span></span>
      </label>
    </div>
  )
}
