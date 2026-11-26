import { useEffect, useState } from 'react';
import type { CheckDimensionId } from '@repo-checkup/shared';

export interface RadarAxisItem {
  key: string;
  label: string;
  scorePercent: number;
  rawLabel: string;
  note: string;
  status: 'ok' | 'warn' | 'risk';
  dimensionId?: CheckDimensionId;
}

interface HexRadarChartProps {
  axes: RadarAxisItem[];
  activeIndex: number;
  onHoverIndex: (index: number) => void;
  onSelectAxis?: (axis: RadarAxisItem) => void;
}

const CX = 190;
const CY = 170;
const MAX_R = 108;
const RINGS = [0.25, 0.5, 0.75, 1];
const ANGLES = [0, 60, 120, 180, 240, 300];

function polarToCartesian(radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad),
    y: CY + radius * Math.sin(rad),
  };
}

function buildHexPoints(radius: number): string {
  return ANGLES.map((deg) => {
    const pt = polarToCartesian(radius, deg);
    return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  }).join(' ');
}

function getStatusDotColor(status: RadarAxisItem['status']): string {
  if (status === 'risk') return 'bg-rose-500';
  if (status === 'warn') return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function HexRadarChart({
  axes,
  activeIndex,
  onHoverIndex,
  onSelectAxis,
}: HexRadarChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dataPoints = axes.map((axis, idx) => {
    const angle = ANGLES[idx] ?? 0;
    const ratio = mounted
      ? Math.max(0.08, Math.min(1, axis.scorePercent / 100))
      : 0.08;
    return polarToCartesian(ratio * MAX_R, angle);
  });

  const polygonPoints = dataPoints
    .map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(' ');

  const activeAxis = axes[activeIndex] ?? axes[0];

  return (
    <div className="flex w-full min-w-0 flex-col items-center justify-center gap-4">
      <svg
        viewBox="0 0 380 340"
        className="w-full max-w-[370px] overflow-visible select-none"
        role="img"
        aria-label="六维能力雷达图"
      >
        {/* Concentric hexagonal grid rings */}
        {RINGS.map((ratio) => (
          <polygon
            key={ratio}
            points={buildHexPoints(MAX_R * ratio)}
            fill="none"
            stroke={ratio === 1 ? '#d6d3d1' : '#e7e5e4'}
            strokeWidth={ratio === 1 ? '1.35' : '1'}
            strokeDasharray={ratio < 1 ? '3 3' : undefined}
          />
        ))}

        {/* Radial spokes */}
        {ANGLES.map((deg) => {
          const outer = polarToCartesian(MAX_R, deg);
          return (
            <line
              key={deg}
              x1={CX}
              y1={CY}
              x2={outer.x.toFixed(1)}
              y2={outer.y.toFixed(1)}
              stroke="#e7e5e4"
              strokeWidth="1"
            />
          );
        })}

        {/* Animated data polygon */}
        <polygon
          className="radar-poly"
          points={polygonPoints}
          fill="rgba(41, 37, 36, 0.11)"
          stroke="#292524"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Center anchor dot */}
        <circle cx={CX} cy={CY} r="2.5" fill="#d6d3d1" />

        {/* Interactive vertices */}
        {dataPoints.map((pt, idx) => {
          const axis = axes[idx];
          const isActive = activeIndex === idx;
          if (!axis) return null;
          return (
            <g key={axis.key}>
              {isActive && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="11"
                  fill="rgba(28, 25, 23, 0.10)"
                  className="pointer-events-none transition-all duration-200"
                />
              )}
              <circle
                className="radar-vertex cursor-pointer"
                cx={pt.x}
                cy={pt.y}
                r={isActive ? 6 : 4}
                fill={isActive ? '#1c1917' : '#ffffff'}
                stroke="#292524"
                strokeWidth={isActive ? 2.5 : 2}
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => {
                  onHoverIndex(idx);
                  onSelectAxis?.(axis);
                }}
              />
            </g>
          );
        })}

        {/* Axis labels & percentages */}
        {axes.map((axis, idx) => {
          const angle = ANGLES[idx] ?? 0;
          const pos = polarToCartesian(MAX_R + 28, angle);
          const isActive = activeIndex === idx;

          let textAnchor: 'start' | 'middle' | 'end' = 'middle';
          if (angle === 60 || angle === 120) textAnchor = 'start';
          if (angle === 240 || angle === 300) textAnchor = 'end';

          const dy = angle === 0 ? -5 : angle === 180 ? 11 : 4;

          return (
            <g
              key={axis.key}
              className="cursor-pointer"
              onMouseEnter={() => onHoverIndex(idx)}
              onClick={() => {
                onHoverIndex(idx);
                onSelectAxis?.(axis);
              }}
            >
              <text
                x={pos.x}
                y={pos.y + dy}
                textAnchor={textAnchor}
                fontSize="12"
                fontWeight={isActive ? 700 : 500}
                fill={isActive ? '#1c1917' : '#57534e'}
              >
                {axis.label}
              </text>
              <text
                x={pos.x}
                y={pos.y + dy + 15}
                textAnchor={textAnchor}
                fontSize="11"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill={isActive ? '#1c1917' : '#78716c'}
              >
                {axis.scorePercent}%
              </text>
            </g>
          );
        })}
      </svg>

      {activeAxis && (
        <div className="flex h-10 w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border border-[#e7e5e4] bg-[#f5f5f4]/80 px-4 text-xs">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${getStatusDotColor(activeAxis.status)}`}
            />
            <span className="shrink-0 font-semibold text-[#1c1917]">
              {activeAxis.label}
            </span>
            <span className="truncate text-[#78716c]">{activeAxis.note}</span>
          </div>
          <span className="shrink-0 font-mono font-semibold text-[#1c1917] tabular-nums">
            {activeAxis.rawLabel}
          </span>
        </div>
      )}
    </div>
  );
}
