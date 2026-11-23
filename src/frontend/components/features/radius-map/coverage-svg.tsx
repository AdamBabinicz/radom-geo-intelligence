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

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  owner?: string;
}

interface LabelPlacement {
  anchor: "start" | "end" | "middle";
  offsetX: number;
  offsetY: number;
  subOffsetY: number;
  nudged: boolean;
}

const CX = 400;
const CY = 400;
const RADAR_RINGS = [15, 30, 50, 75, 100];

function getBasePlacement(
  posX: number,
  posY: number,
  town: TownGeo,
): LabelPlacement {
  let anchor: "start" | "end" | "middle" =
    town.dxKm > 2 ? "start" : town.dxKm < -2 ? "end" : "middle";
  let offsetX = town.dxKm > 2 ? 16 : town.dxKm < -2 ? -16 : 0;

  if (posX > 635) {
    anchor = "end";
    offsetX = -16;
  } else if (posX < 165) {
    anchor = "start";
    offsetX = 16;
  }

  let placeBelow = town.dyKm <= 0;
  if (posY < 62) {
    placeBelow = true;
  } else if (posY > 695) {
    placeBelow = false;
  }

  if (posY < 96 && posX < 360) {
    anchor = "start";
    offsetX = 16;
    placeBelow = true;
  } else if (posY > 690 && posX < 380) {
    anchor = "start";
    offsetX = 16;
    placeBelow = false;
  } else if (posY > 690 && posX > 560) {
    anchor = "end";
    offsetX = -16;
    placeBelow = false;
  }

  const offsetY = placeBelow ? 22 : posY > 755 ? -22 : -18;
  const subOffsetY = placeBelow ? 16 : -16;

  return { anchor, offsetX, offsetY, subOffsetY, nudged: false };
}

function estimateLabelRect(
  posX: number,
  posY: number,
  town: TownGeo,
  placement: LabelPlacement,
  t: AppDictionary,
): Rect {
  const { anchor, offsetX, offsetY, subOffsetY } = placement;

  if (town.isRegionalHub) {
    const hubText = `${town.name} (${town.distKm} ${t.kmUnit})`;
    const boxW = Math.max(hubText.length * 9.2 + 12, 80);
    const x1 =
      anchor === "start"
        ? posX + offsetX - 2
        : anchor === "end"
          ? posX + offsetX - boxW + 2
          : posX + offsetX - boxW / 2;
    const yBase = posY + offsetY;
    return {
      x1,
      y1: yBase - 15,
      x2: x1 + boxW,
      y2: yBase + 6,
    };
  }

  const subText = `${town.distKm} ${t.kmUnit}${
    town.driveMin ? ` · ~${town.driveMin}${t.minUnit}` : ""
  }`;
  const line1W = town.name.length * 8.8 + 10;
  const line2W = subText.length * 7.2 + 8;
  const boxW = Math.max(line1W, line2W, 76);

  const x1 =
    anchor === "start"
      ? posX + offsetX - 2
      : anchor === "end"
        ? posX + offsetX - boxW + 2
        : posX + offsetX - boxW / 2;

  const y1Base = posY + offsetY;
  const y2Base = y1Base + subOffsetY;

  return {
    x1,
    y1: Math.min(y1Base, y2Base) - 15,
    x2: x1 + boxW,
    y2: Math.max(y1Base, y2Base) + 6,
  };
}

function overlapArea(a: Rect, b: Rect, padX = 5, padY = 4): number {
  const ox = Math.max(
    0,
    Math.min(a.x2 + padX, b.x2) - Math.max(a.x1 - padX, b.x1),
  );
  const oy = Math.max(
    0,
    Math.min(a.y2 + padY, b.y2) - Math.max(a.y1 - padY, b.y1),
  );
  return ox * oy;
}

function outOfBoundsPenalty(r: Rect): number {
  const left = Math.max(0, 14 - r.x1);
  const right = Math.max(0, r.x2 - 786);
  const top = Math.max(0, 22 - r.y1);
  const bottom = Math.max(0, r.y2 - 778);
  const overflow = left + right + top + bottom;
  return overflow > 0 ? 50000 + overflow * 250 : 0;
}

function buildCandidates(
  posX: number,
  posY: number,
  town: TownGeo,
): LabelPlacement[] {
  const base = getBasePlacement(posX, posY, town);
  const raw: LabelPlacement[] = [
    base,
    // Czysto boczne (idealne przy pionowych klastrach jak Białołęka / Legionowo)
    {
      anchor: "start",
      offsetX: 17,
      offsetY: -2,
      subOffsetY: 15,
      nudged: false,
    },
    { anchor: "end", offsetX: -17, offsetY: -2, subOffsetY: 15, nudged: false },
    // Standardowe ukośne i pionowe
    {
      anchor: "start",
      offsetX: 16,
      offsetY: 22,
      subOffsetY: 16,
      nudged: false,
    },
    {
      anchor: "start",
      offsetX: 16,
      offsetY: -18,
      subOffsetY: -16,
      nudged: false,
    },
    { anchor: "end", offsetX: -16, offsetY: 22, subOffsetY: 16, nudged: false },
    {
      anchor: "end",
      offsetX: -16,
      offsetY: -18,
      subOffsetY: -16,
      nudged: false,
    },
    {
      anchor: "middle",
      offsetX: 0,
      offsetY: 28,
      subOffsetY: 16,
      nudged: false,
    },
    {
      anchor: "middle",
      offsetX: 0,
      offsetY: -20,
      subOffsetY: -16,
      nudged: false,
    },
    // Szersze odsunięcia z linią prowadzącą dla bardzo gęstych klastrów
    { anchor: "start", offsetX: 28, offsetY: -4, subOffsetY: 15, nudged: true },
    { anchor: "end", offsetX: -28, offsetY: -4, subOffsetY: 15, nudged: true },
    { anchor: "start", offsetX: 24, offsetY: 34, subOffsetY: 16, nudged: true },
    { anchor: "end", offsetX: -24, offsetY: 34, subOffsetY: 16, nudged: true },
    {
      anchor: "start",
      offsetX: 24,
      offsetY: -30,
      subOffsetY: -16,
      nudged: true,
    },
    {
      anchor: "end",
      offsetX: -24,
      offsetY: -30,
      subOffsetY: -16,
      nudged: true,
    },
    { anchor: "middle", offsetX: 0, offsetY: 46, subOffsetY: 16, nudged: true },
    {
      anchor: "middle",
      offsetX: 0,
      offsetY: -38,
      subOffsetY: -16,
      nudged: true,
    },
  ];

  const seen = new Set<string>();
  return raw.filter((c) => {
    const key = `${c.anchor}:${c.offsetX}:${c.offsetY}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function computeLabelPlacements(
  towns: TownGeo[],
  pxPerKm: number,
  scaleX1: number,
  scaleY: number,
  t: AppDictionary,
): Map<string, LabelPlacement> {
  const occupied: Rect[] = [
    // Centralna etykieta miasta bazowego
    { x1: CX - 108, y1: CY - 16, x2: CX + 108, y2: CY + 52 },
    // Pigułka kierunku północnego (lewy górny róg)
    { x1: 0, y1: 0, x2: 345, y2: 74 },
    // Przyciski zoom + / - / reset (prawy górny róg)
    { x1: 726, y1: 0, x2: 800, y2: 145 },
    // Legenda zasięgu (lewy dolny róg)
    { x1: 0, y1: 718, x2: 380, y2: 800 },
    // Podziałka skali (prawy dolny róg)
    { x1: scaleX1 - 18, y1: scaleY - 32, x2: 792, y2: 792 },
  ];

  const visibleTowns = towns
    .map((town) => ({
      town,
      posX: CX + town.dxKm * pxPerKm,
      posY: CY - town.dyKm * pxPerKm,
    }))
    .filter(({ posX, posY, town }) => {
      if (posX < -50 || posX > 850 || posY < -50 || posY > 850) return false;
      if (town.isRegionalHub) {
        const overlapsNorthPill = posY < 96 && posX < 340;
        if (
          posX < 40 ||
          posX > 760 ||
          posY < 45 ||
          posY > 715 ||
          overlapsNorthPill
        ) {
          return false;
        }
      }
      return true;
    });

  // Zarezerwuj miejsca kropek — z oznaczeniem właściciela, by etykieta nie karała samej siebie
  for (const { town, posX, posY } of visibleTowns) {
    occupied.push({
      x1: posX - 11,
      y1: posY - 11,
      x2: posX + 11,
      y2: posY + 11,
      owner: town.name,
    });
  }

  const ordered = [...visibleTowns].sort((a, b) => {
    if (Boolean(a.town.isRegionalHub) !== Boolean(b.town.isRegionalHub)) {
      return a.town.isRegionalHub ? 1 : -1;
    }
    return a.town.distKm - b.town.distKm;
  });

  const result = new Map<string, LabelPlacement>();

  for (const { town, posX, posY } of ordered) {
    const candidates = buildCandidates(posX, posY, town);
    let bestCandidate = candidates[0];
    let bestRect = estimateLabelRect(posX, posY, town, bestCandidate, t);
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const rect = estimateLabelRect(posX, posY, town, candidate, t);
      let score = outOfBoundsPenalty(rect) + i * 3;

      for (const occ of occupied) {
        if (occ.owner === town.name) {
          // Dla własnej kropki sprawdzamy tylko twarde nachodzenie (bez dodatkowego paddingu)
          score += overlapArea(rect, occ, 0, 0) * 150;
        } else {
          score += overlapArea(rect, occ) * 100;
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
        bestRect = rect;
      }

      if (score === i * 3) {
        break;
      }
    }

    occupied.push(bestRect);
    result.set(town.name, bestCandidate);
  }

  return result;
}

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

  const placements = computeLabelPlacements(towns, pxPerKm, scaleX1, scaleY, t);

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
        const placement =
          placements.get(town.name) ?? getBasePlacement(posX, posY, town);
        const { anchor, offsetX, offsetY, subOffsetY, nudged } = placement;

        if (town.isRegionalHub) {
          const overlapsNorthPill = posY < 96 && posX < 340;
          if (
            posX < 40 ||
            posX > 760 ||
            posY < 45 ||
            posY > 715 ||
            overlapsNorthPill
          ) {
            return null;
          }
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
            {nudged && (
              <line
                x1={posX}
                y1={posY}
                x2={posX + offsetX * 0.75}
                y2={
                  posY +
                  (offsetY > 10
                    ? offsetY - 12
                    : offsetY < -10
                      ? offsetY + 2
                      : 0)
                }
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="2 2"
                className="text-slate-400/80 dark:text-slate-500/80"
              />
            )}
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
              y={posY + offsetY + subOffsetY}
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
          x={CX - 102}
          y={CY + 18}
          width="204"
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
