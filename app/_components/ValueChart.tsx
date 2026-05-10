"use client";

import { useRef, useState } from "react";

export type ChartMarker = {
  x: number;
  y: number;
  color: string;
  title?: string;
};

export type ChartRow = {
  x: number;
  date: string;
  cumulativeCost: number;
  totalValue: number;
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

const W = 720;
const H = 300;
const PAD = { top: 20, right: 20, bottom: 36, left: 64 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;

export function ValueChart({ rows, markers }: { rows: ChartRow[]; markers?: ChartMarker[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (rows.length === 0) return null;

  const xs = rows.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);

  const allYs = rows.flatMap((p) => [p.cumulativeCost, p.totalValue]);
  const yMin = Math.min(...allYs);
  const yMax = Math.max(...allYs);
  const yPad = (yMax - yMin) * 0.1 || yMax * 0.1 || 1;
  const yLo = Math.max(0, yMin - yPad);
  const yHi = yMax + yPad;

  const sx = (x: number) =>
    xMax === xMin ? PAD.left + innerW / 2 : PAD.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const sy = (y: number) => PAD.top + innerH - ((y - yLo) / (yHi - yLo)) * innerH;

  const valuePath = rows.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.totalValue)}`).join(" ");
  const costPath = rows.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.cumulativeCost)}`).join(" ");
  const areaPath =
    `M ${sx(rows[0].x)} ${PAD.top + innerH} ` +
    rows.map((p) => `L ${sx(p.x)} ${sy(p.totalValue)}`).join(" ") +
    ` L ${sx(rows[rows.length - 1].x)} ${PAD.top + innerH} Z`;

  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yLo + ((yHi - yLo) * i) / yTicks);
  const xTickCount = Math.min(6, rows.length);
  const xTickIdx = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((i * (rows.length - 1)) / Math.max(1, xTickCount - 1))
  );

  const fmtY = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` :
    v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : v.toFixed(0);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xVB = ((e.clientX - rect.left) / rect.width) * W;
    let bestIdx = 0;
    let bestDist = Infinity;
    rows.forEach((p, i) => {
      const d = Math.abs(sx(p.x) - xVB);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    setHoverIdx(bestIdx);
  }

  const hover = hoverIdx !== null ? rows[hoverIdx] : null;
  const hoverPL = hover ? hover.totalValue - hover.cumulativeCost : 0;
  const hoverPLPct = hover && hover.cumulativeCost > 0 ? (hoverPL / hover.cumulativeCost) * 100 : 0;

  let tooltipLeft = 0;
  let tooltipTop = 0;
  if (hover && containerRef.current) {
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    tooltipLeft = (sx(hover.x) / W) * cw;
    tooltipTop = (sy(hover.totalValue) / H) * ch;
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTickVals.map((v, i) => (
          <g key={`y-${i}`}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={sy(v)} y2={sy(v)} stroke="#e5e7eb" strokeDasharray="3 3" />
            <text x={PAD.left - 8} y={sy(v) + 4} textAnchor="end" fontSize="10" fill="#6b7280">
              ฿{fmtY(v)}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="url(#areaFill)" />
        <path d={costPath} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="5 4" />
        <path d={valuePath} fill="none" stroke="#3b82f6" strokeWidth="2" />

        {markers?.map((m, i) => (
          <circle key={`m-${i}`} cx={sx(m.x)} cy={sy(m.y)} r="4.5" fill={m.color} stroke="white" strokeWidth="2" />
        ))}

        {hover && (
          <g pointerEvents="none">
            <line
              x1={sx(hover.x)} x2={sx(hover.x)}
              y1={PAD.top} y2={PAD.top + innerH}
              stroke="#9ca3af" strokeDasharray="3 3"
            />
            <circle cx={sx(hover.x)} cy={sy(hover.cumulativeCost)} r="4" fill="white" stroke="#9ca3af" strokeWidth="2" />
            <circle cx={sx(hover.x)} cy={sy(hover.totalValue)} r="5" fill="white" stroke="#3b82f6" strokeWidth="2.5" />
          </g>
        )}

        {xTickIdx.map((idx, i) => {
          const p = rows[idx];
          return (
            <text key={`x-${i}`} x={sx(p.x)} y={H - 12} textAnchor="middle" fontSize="10" fill="#6b7280">
              {fmtDate(p.date)}
            </text>
          );
        })}
      </svg>

      {hover && containerRef.current && (
        <div
          className="absolute pointer-events-none bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[180px] -translate-x-1/2 -translate-y-full"
          style={{
            left: `${tooltipLeft}px`,
            top: `${Math.max(0, tooltipTop - 12)}px`,
          }}
        >
          <p className="font-semibold text-gray-900 mb-2">{fmtDate(hover.date)}</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">มูลค่าตลาด</span>
              <span className="font-medium text-blue-600">฿{fmt(hover.totalValue)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">ต้นทุนสะสม</span>
              <span className="font-medium text-gray-700">฿{fmt(hover.cumulativeCost)}</span>
            </div>
            <div className="flex justify-between gap-4 pt-1 border-t border-gray-100">
              <span className="text-gray-500">กำไร / ขาดทุน</span>
              <span className={`font-semibold ${hoverPL >= 0 ? "text-green-600" : "text-red-500"}`}>
                {hoverPL >= 0 ? "+" : ""}฿{fmt(hoverPL)}
                <span className="ml-1 text-[10px]">({hoverPL >= 0 ? "+" : ""}{hoverPLPct.toFixed(2)}%)</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
