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
  const [brush, setBrush] = useState<{ start: number; end: number } | null>(null); // SVG viewbox x
  const [zoomedXRange, setZoomedXRange] = useState<[number, number] | null>(null);

  if (rows.length === 0) return null;

  // Apply zoom filter
  const displayRows = zoomedXRange
    ? rows.filter((r) => r.x >= zoomedXRange[0] && r.x <= zoomedXRange[1])
    : rows;
  const displayMarkers = zoomedXRange
    ? markers?.filter((m) => m.x >= zoomedXRange[0] && m.x <= zoomedXRange[1])
    : markers;

  if (displayRows.length < 2) {
    return (
      <div className="text-center py-12 text-sm text-gray-500">
        {zoomedXRange ? (
          <>
            <p>ไม่มีข้อมูลในช่วงที่เลือก</p>
            <button
              onClick={() => { setZoomedXRange(null); setHoverIdx(null); }}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
            >
              ↩ รีเซ็ต zoom
            </button>
          </>
        ) : (
          <p>ต้องมีข้อมูลอย่างน้อย 2 จุดเพื่อแสดงกราฟ</p>
        )}
      </div>
    );
  }

  // Scale helpers (based on displayRows so zoom works automatically)
  const xs = displayRows.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);

  const allYs = displayRows.flatMap((p) => [p.cumulativeCost, p.totalValue]);
  const yMin = Math.min(...allYs);
  const yMax = Math.max(...allYs);
  const yPad = (yMax - yMin) * 0.1 || yMax * 0.1 || 1;
  const yLo = Math.max(0, yMin - yPad);
  const yHi = yMax + yPad;

  const sx = (x: number) =>
    xMax === xMin ? PAD.left + innerW / 2 : PAD.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const sy = (y: number) => PAD.top + innerH - ((y - yLo) / (yHi - yLo)) * innerH;

  // Convert SVG viewbox x → data timestamp
  const svgXToTs = (svgX: number) =>
    xMin + ((svgX - PAD.left) / innerW) * (xMax - xMin);

  // Get SVG viewbox x from mouse event (clamped to chart area)
  function getMouseSVGX(e: React.MouseEvent<SVGSVGElement>): number {
    const svg = svgRef.current;
    if (!svg) return PAD.left;
    const rect = svg.getBoundingClientRect();
    const raw = ((e.clientX - rect.left) / rect.width) * W;
    return Math.max(PAD.left, Math.min(PAD.left + innerW, raw));
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault();
    const svgX = getMouseSVGX(e);
    setBrush({ start: svgX, end: svgX });
    setHoverIdx(null);
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svgX = getMouseSVGX(e);
    if (brush) {
      // Update brush end; suppress tooltip while dragging
      setBrush((b) => (b ? { ...b, end: svgX } : null));
      return;
    }
    // Find nearest data point for tooltip
    let bestIdx = 0;
    let bestDist = Infinity;
    displayRows.forEach((p, i) => {
      const d = Math.abs(sx(p.x) - svgX);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    setHoverIdx(bestIdx);
  }

  function handleMouseUp() {
    if (!brush) return;
    const { start, end } = brush;
    setBrush(null);
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    if (hi - lo < 8) return; // too small → treat as click, ignore
    setZoomedXRange([svgXToTs(lo), svgXToTs(hi)]);
    setHoverIdx(null);
  }

  function handleMouseLeave() {
    if (brush) setBrush(null); // cancel in-progress brush
    setHoverIdx(null);
  }

  // Paths
  const valuePath = displayRows.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.totalValue)}`).join(" ");
  const costPath = displayRows.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.cumulativeCost)}`).join(" ");
  const areaPath =
    `M ${sx(displayRows[0].x)} ${PAD.top + innerH} ` +
    displayRows.map((p) => `L ${sx(p.x)} ${sy(p.totalValue)}`).join(" ") +
    ` L ${sx(displayRows[displayRows.length - 1].x)} ${PAD.top + innerH} Z`;

  // Axes
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yLo + ((yHi - yLo) * i) / yTicks);
  const xTickCount = Math.min(6, displayRows.length);
  const xTickIdx = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((i * (displayRows.length - 1)) / Math.max(1, xTickCount - 1))
  );
  const fmtY = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` :
    v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : v.toFixed(0);

  // Tooltip
  const hover = hoverIdx !== null && !brush ? displayRows[hoverIdx] : null;
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

  // Brush rectangle
  const brushRect = brush
    ? { x: Math.min(brush.start, brush.end), w: Math.abs(brush.end - brush.start) }
    : null;

  return (
    <div ref={containerRef} className="relative w-full select-none">

      {/* Reset zoom button */}
      {zoomedXRange && (
        <button
          onClick={() => { setZoomedXRange(null); setHoverIdx(null); }}
          className="absolute top-0 right-0 z-10 flex items-center gap-1 text-[10px] px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          รีเซ็ต zoom
        </button>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        style={{ cursor: brush ? "ew-resize" : "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y grid + labels */}
        {yTickVals.map((v, i) => (
          <g key={`y-${i}`}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={sy(v)} y2={sy(v)} stroke="#374151" strokeDasharray="3 3" />
            <text x={PAD.left - 8} y={sy(v) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
              ฿{fmtY(v)}
            </text>
          </g>
        ))}

        {/* Chart lines */}
        <path d={areaPath} fill="url(#areaFill)" />
        <path d={costPath} fill="none" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="5 4" />
        <path d={valuePath} fill="none" stroke="#3b82f6" strokeWidth="2" />

        {/* Transaction markers */}
        {displayMarkers?.map((m, i) => (
          <circle key={`m-${i}`} cx={sx(m.x)} cy={sy(m.y)} r="4.5" fill={m.color} stroke="#1f2937" strokeWidth="2" />
        ))}

        {/* Brush selection overlay */}
        {brushRect && brushRect.w > 2 && (
          <>
            <rect
              x={brushRect.x}
              y={PAD.top}
              width={brushRect.w}
              height={innerH}
              fill="#3b82f6"
              fillOpacity="0.12"
              stroke="#3b82f6"
              strokeWidth="1"
              strokeOpacity="0.5"
            />
            {/* Left edge line */}
            <line x1={brushRect.x} x2={brushRect.x} y1={PAD.top} y2={PAD.top + innerH} stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.8" />
            {/* Right edge line */}
            <line x1={brushRect.x + brushRect.w} x2={brushRect.x + brushRect.w} y1={PAD.top} y2={PAD.top + innerH} stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.8" />
          </>
        )}

        {/* Hover crosshair + dots */}
        {hover && (
          <g pointerEvents="none">
            <line
              x1={sx(hover.x)} x2={sx(hover.x)}
              y1={PAD.top} y2={PAD.top + innerH}
              stroke="#6b7280" strokeDasharray="3 3"
            />
            <circle cx={sx(hover.x)} cy={sy(hover.cumulativeCost)} r="4" fill="#1f2937" stroke="#6b7280" strokeWidth="2" />
            <circle cx={sx(hover.x)} cy={sy(hover.totalValue)} r="5" fill="#1f2937" stroke="#3b82f6" strokeWidth="2.5" />
          </g>
        )}

        {/* X-axis labels */}
        {xTickIdx.map((idx, i) => {
          const p = displayRows[idx];
          const anchor = i === 0 ? "start" : i === xTickIdx.length - 1 ? "end" : "middle";
          return (
            <text key={`x-${i}`} x={sx(p.x)} y={H - 12} textAnchor={anchor} fontSize="10" fill="#9ca3af">
              {fmtDate(p.date)}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hover && containerRef.current && (
        <div
          className="absolute pointer-events-none bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-3 text-xs min-w-[180px] -translate-x-1/2 -translate-y-full"
          style={{ left: `${tooltipLeft}px`, top: `${Math.max(0, tooltipTop - 12)}px` }}
        >
          <p className="font-semibold text-gray-100 mb-2">{fmtDate(hover.date)}</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">มูลค่าตลาด</span>
              <span className="font-medium text-blue-400">฿{fmt(hover.totalValue)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">ต้นทุนสะสม</span>
              <span className="font-medium text-gray-300">฿{fmt(hover.cumulativeCost)}</span>
            </div>
            <div className="flex justify-between gap-4 pt-1 border-t border-gray-700">
              <span className="text-gray-400">กำไร / ขาดทุน</span>
              <span className={`font-semibold ${hoverPL >= 0 ? "text-green-400" : "text-red-400"}`}>
                {hoverPL >= 0 ? "+" : ""}฿{fmt(hoverPL)}
                <span className="ml-1 text-[10px]">({hoverPL >= 0 ? "+" : ""}{hoverPLPct.toFixed(2)}%)</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Hint text */}
      {!zoomedXRange && !brush && (
        <p className="absolute bottom-0 right-0 text-[10px] text-gray-700 pointer-events-none">
          คลุมเพื่อ zoom
        </p>
      )}
    </div>
  );
}
