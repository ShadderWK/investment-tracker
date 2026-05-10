"use client";

import { useState } from "react";

export type PieSlice = {
  label: string;
  sublabel?: string;
  value: number;
};

const PALETTE = ["#3b82f6", "#8b5cf6", "#f59e0b", "#16a34a", "#ef4444", "#06b6d4", "#ec4899", "#10b981", "#6366f1", "#f97316"];

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number) {
  const startX1 = cx + rOuter * Math.cos(start);
  const startY1 = cy + rOuter * Math.sin(start);
  const endX1 = cx + rOuter * Math.cos(end);
  const endY1 = cy + rOuter * Math.sin(end);
  const startX2 = cx + rInner * Math.cos(end);
  const startY2 = cy + rInner * Math.sin(end);
  const endX2 = cx + rInner * Math.cos(start);
  const endY2 = cy + rInner * Math.sin(start);
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${startX1} ${startY1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${endX1} ${endY1}`,
    `L ${startX2} ${startY2}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${endX2} ${endY2}`,
    "Z",
  ].join(" ");
}

export function PieChart({ slices }: { slices: PieSlice[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return <div className="text-center py-12 text-sm text-gray-500">ยังไม่มีมูลค่าให้แสดง</div>;
  }

  const cx = 150;
  const cy = 150;
  const rOuter = 120;
  const rInner = 70;

  let acc = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const start = acc;
    const angle = (s.value / total) * Math.PI * 2;
    const end = acc + angle;
    acc = end;
    return {
      slice: s,
      start, end,
      mid: (start + end) / 2,
      color: PALETTE[i % PALETTE.length],
      idx: i,
      pct: (s.value / total) * 100,
    };
  });

  const center = hoverIdx !== null ? arcs[hoverIdx] : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      <div className="relative w-full max-w-[300px] mx-auto">
        <svg viewBox="0 0 300 300" className="w-full h-auto">
          {arcs.map((a) => {
            const isHover = hoverIdx === a.idx;
            const r = isHover ? rOuter + 6 : rOuter;
            return (
              <path
                key={a.idx}
                d={arcPath(cx, cy, r, rInner, a.start, a.end)}
                fill={a.color}
                opacity={hoverIdx === null || isHover ? 1 : 0.4}
                onMouseEnter={() => setHoverIdx(a.idx)}
                onMouseLeave={() => setHoverIdx(null)}
                className="transition-opacity cursor-pointer"
              />
            );
          })}

          <text x={cx} y={cy - 8} textAnchor="middle" fontSize="11" fill="#9ca3af">
            {center ? center.slice.label : "มูลค่ารวม"}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="18" fontWeight="600" fill="#f9fafb">
            ฿{center ? fmt(center.slice.value) : fmt(total)}
          </text>
          <text x={cx} y={cy + 32} textAnchor="middle" fontSize="11" fill="#9ca3af">
            {center ? `${center.pct.toFixed(2)}%` : `${slices.length} สินทรัพย์`}
          </text>
        </svg>
      </div>

      <div className="space-y-1.5">
        {arcs.map((a) => {
          const isHover = hoverIdx === a.idx;
          return (
            <div
              key={a.idx}
              onMouseEnter={() => setHoverIdx(a.idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer transition ${
                isHover ? "bg-gray-800" : "hover:bg-gray-800/50"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: a.color }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-100 truncate">{a.slice.label}</p>
                  {a.slice.sublabel && (
                    <p className="text-xs text-gray-400 truncate">{a.slice.sublabel}</p>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-gray-100">{a.pct.toFixed(2)}%</p>
                <p className="text-xs text-gray-400">฿{fmt(a.slice.value)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
