"use client";

export type ChartMarker = {
  x: number;
  y: number;
  color: string;
  title: string;
};

export type ChartRow = {
  x: number;
  date: string;
  cumulativeCost: number;
  totalValue: number;
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

export function ValueChart({ rows, markers }: { rows: ChartRow[]; markers?: ChartMarker[] }) {
  const W = 720;
  const H = 300;
  const PAD = { top: 20, right: 20, bottom: 36, left: 64 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

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

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
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
        <circle key={`m-${i}`} cx={sx(m.x)} cy={sy(m.y)} r="4.5" fill={m.color} stroke="white" strokeWidth="2">
          <title>{m.title}</title>
        </circle>
      ))}

      {xTickIdx.map((idx, i) => {
        const p = rows[idx];
        return (
          <text key={`x-${i}`} x={sx(p.x)} y={H - 12} textAnchor="middle" fontSize="10" fill="#6b7280">
            {fmtDate(p.date)}
          </text>
        );
      })}
    </svg>
  );
}
