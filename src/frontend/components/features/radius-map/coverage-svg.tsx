"use client";

import type { TownGeo } from "@/src/config/markets";
import type { AppDictionary } from "@/src/locales";

interface CoverageSvgProps {
  t: AppDictionary;
  centerName: string;
  towns: TownGeo[];
  radiusKm: number;
  pxPerKm: number;
  scaleBarKm: number;
  selectedTown: TownGeo | null;
  onSelectTown: (town: TownGeo) => void;
}

const CX = 400;
const CY = 400;
const RADAR_RINGS = [15, 30, 50, 75, 100];

export function CoverageSvg({
  t,
  centerName,
  towns,
  radiusKm,
  pxPerKm,
  scaleBarKm,
  selectedTown,
  onSelectTown,
}: CoverageSvgProps) {
  const svgCircleRadius = radiusKm * pxPerKm;
  const scaleBarPx = Math.max(Math.round(scaleBarKm * pxPerKm), 32);
  const scaleX2 = 772;
  const scaleX1 = scaleX2 - scaleBarPx;
  const scaleY = 766;

  return (
    <svg
      viewBox="0 0 800 800"
      className="size-full select-none"
      aria-label={t.coverageTitle}
    >
      {RADAR_RINGS.map((ringKm) => {
        const ringPx = ringKm * pxPerKm;
        if (ringPx > 550) return null;
        return (
          <g key={ringKm}>
            <circle
              cx={CX}
              cy={CY}
              r={ringPx}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 4"
              className="text-slate-300/80 dark:text-slate-800"
            />
            <text
              x={CX + 8}
              y={CY - ringPx + 14}
              className="fill-slate-500 font-mono text-[11px] font-bold dark:fill-slate-400"
            >
              {ringKm} {t.kmUnit}
            </text>
          </g>
        );
      })}

      <line
        x1={CX}
        y1="10"
        x2={CX}
        y2="790"
        stroke="currentColor"
        strokeWidth="1"
        className="text-slate-300/60 dark:text-slate-800/80"
      />
      <line
        x1="10"
        y1={CY}
        x2="790"
        y2={CY}
        stroke="currentColor"
        strokeWidth="1"
        className="text-slate-300/60 dark:text-slate-800/80"
      />

      <circle
        cx={CX}
        cy={CY}
        r={svgCircleRadius}
        fill="currentColor"
        className="text-teal-500/10 transition-all duration-150 dark:text-teal-400/10"
      />
      <circle
        cx={CX}
        cy={CY}
        r={svgCircleRadius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="8 6"
        className="text-teal-600 transition-all duration-150 dark:text-teal-400"
      />

      {towns.map((town) => {
        const posX = CX + town.dxKm * pxPerKm;
        const posY = CY - town.dyKm * pxPerKm;
        if (posX < -60 || posX > 860 || posY < -60 || posY > 860) return null;
        const inRange = town.distKm <= radiusKm;

        return (
          <line
            key={`line-${town.name}`}
            x1={CX}
            y1={CY}
            x2={posX}
            y2={posY}
            stroke="currentColor"
            strokeWidth={town.isRegionalHub ? 1.2 : 1.5}
            strokeDasharray={
              town.isRegionalHub ? "4 4" : inRange ? undefined : "2 2"
            }
            className={
              town.isRegionalHub
                ? "text-indigo-400/40 dark:text-indigo-400/30"
                : inRange
                  ? "text-teal-500/50 dark:text-teal-400/40"
                  : "text-slate-300 dark:text-slate-700"
            }
          />
        );
      })}

      {towns.map((town) => {
        const posX = CX + town.dxKm * pxPerKm;
        const posY = CY - town.dyKm * pxPerKm;
        if (posX < -50 || posX > 850 || posY < -50 || posY > 850) return null;

        const inRange = town.distKm <= radiusKm;
        const isSelected = selectedTown?.name === town.name;
        const anchor =
          town.dxKm > 2 ? "start" : town.dxKm < -2 ? "end" : "middle";
        const offsetX = town.dxKm > 2 ? 14 : town.dxKm < -2 ? -14 : 0;
        const offsetY = town.dyKm > 0 ? -13 : 20;

        if (town.isRegionalHub) {
          const overlapsNorthPill = posY < 96 && posX < 340;
          if (
            posX < 40 ||
            posX > 760 ||
            posY < 45 ||
            posY > 715 ||
            overlapsNorthPill
          )
            return null;
          return (
            <g key={town.name} className="cursor-default">
              <rect
                x={posX - 6}
                y={posY - 6}
                width="12"
                height="12"
                fill="currentColor"
                strokeWidth="2"
                className={`${
                  inRange
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-400 dark:text-slate-600"
                } stroke-white dark:stroke-[#111a1c]`}
              />
              <text
                x={posX + offsetX}
                y={posY + offsetY}
                textAnchor={anchor}
                strokeWidth="4"
                paintOrder="stroke"
                strokeLinejoin="round"
                className="fill-indigo-950 stroke-white text-[14px] font-black uppercase tracking-wider dark:fill-indigo-200 dark:stroke-[#111a1c]"
              >
                {town.name} ({town.distKm} {t.kmUnit})
              </text>
            </g>
          );
        }

        return (
          <g
            key={town.name}
            role="button"
            tabIndex={0}
            aria-label={`${town.name} (${town.distKm} ${t.kmUnit})`}
            onClick={() => onSelectTown(town)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectTown(town);
              }
            }}
            className="cursor-pointer outline-none"
          >
            {isSelected && (
              <circle
                cx={posX}
                cy={posY}
                r={14}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-teal-500 dark:text-teal-300"
              />
            )}
            <circle
              cx={posX}
              cy={posY}
              r={8.5}
              fill="currentColor"
              strokeWidth="2.5"
              className={`${
                inRange
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-amber-500 dark:text-amber-400"
              } stroke-white dark:stroke-[#111a1c]`}
            />
            <text
              x={posX + offsetX}
              y={posY + offsetY}
              textAnchor={anchor}
              strokeWidth="4"
              paintOrder="stroke"
              strokeLinejoin="round"
              className={`select-none stroke-white text-[15px] font-bold dark:stroke-[#111a1c] ${
                inRange
                  ? "fill-slate-900 dark:fill-slate-100"
                  : "fill-slate-600 dark:fill-slate-400"
              }`}
            >
              {town.name}
            </text>
            <text
              x={posX + offsetX}
              y={posY + offsetY + (town.dyKm > 0 ? -16 : 16)}
              textAnchor={anchor}
              strokeWidth="3.5"
              paintOrder="stroke"
              strokeLinejoin="round"
              className={`select-none stroke-white font-mono text-[12px] font-bold dark:stroke-[#111a1c] ${
                inRange
                  ? "fill-teal-700 dark:fill-teal-300"
                  : "fill-amber-700 dark:fill-amber-400"
              }`}
            >
              {town.distKm} {t.kmUnit}
              {town.driveMin ? ` · ~${town.driveMin}${t.minUnit}` : ""}
            </text>
          </g>
        );
      })}

      <circle
        cx={CX}
        cy={CY}
        r="13"
        fill="currentColor"
        strokeWidth="3"
        className="stroke-white text-teal-700 dark:stroke-[#111a1c] dark:text-teal-400"
      />
      <circle
        cx={CX}
        cy={CY}
        r="4.5"
        className="fill-white dark:fill-slate-900"
      />
      <g>
        <rect
          x={CX - 95}
          y={CY + 18}
          width="190"
          height="28"
          rx="8"
          strokeWidth="1.5"
          className="fill-white/95 stroke-teal-700 dark:fill-slate-900/95 dark:stroke-teal-400"
        />
        <text
          x={CX}
          y={CY + 36}
          textAnchor="middle"
          className="fill-teal-900 text-[12px] font-black uppercase tracking-wider dark:fill-teal-200"
        >
          ★ {centerName} ({t.baseLabel} 0 {t.kmUnit})
        </text>
      </g>

      <g>
        <rect
          x={scaleX1 - 12}
          y={scaleY - 26}
          width={scaleBarPx + 24}
          height="38"
          rx="6"
          className="fill-white/90 stroke-slate-200 dark:fill-slate-900/90 dark:stroke-slate-700"
          strokeWidth="1"
        />
        <path
          d={`M ${scaleX1} ${scaleY - 4} V ${scaleY} H ${scaleX2} V ${scaleY - 4}`}
          fill="none"
          strokeWidth="2"
          className="stroke-slate-600 dark:stroke-slate-300"
        />
        <text
          x={(scaleX1 + scaleX2) / 2}
          y={scaleY - 10}
          textAnchor="middle"
          className="fill-slate-700 font-mono text-[11px] font-semibold dark:fill-slate-300"
        >
          {t.scaleLabel}: {scaleBarKm} {t.kmUnit}
        </text>
      </g>
    </svg>
  );
}
