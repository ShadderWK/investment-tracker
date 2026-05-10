"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Transaction = {
  id: string;
  symbol: string;
  asset_type: string;
  tx_type: string;
  amount: number;
  total_value: number;
  date: string;
};

const TYPE_LABEL: Record<string, string> = {
  stock: "หุ้น", crypto: "คริปโต", gold: "ทองคำ", etf: "ETF", fund: "กองทุน",
};

const TYPE_COLOR: Record<string, string> = {
  stock: "bg-blue-100 text-blue-700",
  crypto: "bg-purple-100 text-purple-700",
  gold: "bg-amber-100 text-amber-700",
  etf: "bg-green-100 text-green-700",
  fund: "bg-indigo-100 text-indigo-700",
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

type ChartRow = {
  x: number;
  date: string;
  cumulativeCost: number;
  totalValue: number;
  amount: number;
  txType: string;
};

function ValueChart({ rows }: { rows: ChartRow[] }) {
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
            ฿{v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
          </text>
        </g>
      ))}

      <path d={areaPath} fill="url(#areaFill)" />
      <path d={costPath} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="5 4" />
      <path d={valuePath} fill="none" stroke="#3b82f6" strokeWidth="2" />

      {rows.map((p, i) => {
        const isSell = p.txType === "sell";
        const isSnapshot = p.amount === 0;
        const fill = isSnapshot ? "#9ca3af" : isSell ? "#ef4444" : "#16a34a";
        return (
          <circle
            key={`pt-${i}`}
            cx={sx(p.x)}
            cy={sy(p.totalValue)}
            r="4.5"
            fill={fill}
            stroke="white"
            strokeWidth="2"
          >
            <title>
              {`${fmtDate(p.date)}\n${isSnapshot ? "Snapshot" : isSell ? "ขาย" : "ซื้อ"} ฿${fmt(p.amount)}\nต้นทุนรวม ฿${fmt(p.cumulativeCost)}\nมูลค่ารวม ฿${fmt(p.totalValue)}\nกำไร ${p.totalValue - p.cumulativeCost >= 0 ? "+" : ""}฿${fmt(p.totalValue - p.cumulativeCost)}`}
            </title>
          </circle>
        );
      })}

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

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol).toUpperCase();

  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      let portfolioId = localStorage.getItem("portfolio_id");
      if (!portfolioId) {
        const { data: portfolios } = await supabase
          .from("portfolios").select("id").eq("user_id", session.user.id);
        portfolioId = portfolios?.[0]?.id ?? null;
        if (portfolioId) localStorage.setItem("portfolio_id", portfolioId);
      }
      if (!portfolioId) { setNotFound(true); setLoading(false); return; }

      const { data } = await supabase
        .from("transactions").select("*")
        .eq("portfolio_id", portfolioId)
        .eq("symbol", symbol)
        .order("date", { ascending: true });

      const list = (data || []) as Transaction[];
      if (list.length === 0) setNotFound(true);
      setTxs(list);
      setLoading(false);
    })();
  }, [symbol, router]);

  const summary = useMemo(() => {
    let totalCost = 0;
    let lastValue = 0;
    let assetType = "";
    let lastDate = "";
    txs.forEach((t) => {
      assetType = t.asset_type;
      const delta = t.tx_type === "sell" ? -Number(t.amount) : Number(t.amount);
      totalCost += delta;
      if (t.date >= lastDate) {
        lastValue = Number(t.total_value);
        lastDate = t.date;
      }
    });
    const pl = lastValue - totalCost;
    const plPct = totalCost > 0 ? (pl / totalCost) * 100 : 0;
    return { totalCost, currentValue: lastValue, pl, plPct, assetType, txCount: txs.length };
  }, [txs]);

  const chartRows: ChartRow[] = useMemo(() => {
    let cum = 0;
    return txs.map((t) => {
      const delta = t.tx_type === "sell" ? -Number(t.amount) : Number(t.amount);
      cum += delta;
      return {
        x: new Date(t.date).getTime(),
        date: t.date,
        cumulativeCost: cum,
        totalValue: Number(t.total_value),
        amount: Number(t.amount),
        txType: t.tx_type,
      };
    });
  }, [txs]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">กำลังโหลดข้อมูล...</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-600 hover:text-gray-900 mb-6"
          >
            ← กลับหน้า Dashboard
          </button>
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-sm font-medium text-gray-700">ไม่พบข้อมูลสินทรัพย์ {symbol}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/")}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">
              {symbol.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">{symbol}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[summary.assetType] || "bg-gray-100 text-gray-600"}`}>
                  {TYPE_LABEL[summary.assetType] || summary.assetType}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{summary.txCount} รายการ</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "ต้นทุนรวม", value: `฿${fmt(summary.totalCost)}`, color: "text-gray-900" },
            { label: "มูลค่าปัจจุบัน", value: `฿${fmt(summary.currentValue)}`, color: "text-gray-900" },
            { label: "กำไร / ขาดทุน",
              value: `${summary.pl >= 0 ? "+" : ""}฿${fmt(summary.pl)}`,
              color: summary.pl >= 0 ? "text-green-600" : "text-red-500" },
            { label: "ผลตอบแทน",
              value: `${summary.plPct >= 0 ? "+" : ""}${summary.plPct.toFixed(2)}%`,
              color: summary.plPct >= 0 ? "text-green-600" : "text-red-500" },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">{m.label}</p>
              <p className={`text-lg font-semibold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-gray-700">มูลค่าและต้นทุนตามเวลา</h2>
              <p className="text-xs text-gray-400 mt-0.5">เส้นน้ำเงิน = มูลค่าตลาด · เส้นเทาประ = ต้นทุนสะสม</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-600" />ซื้อ</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />ขาย</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-400" />Snapshot</span>
            </div>
          </div>
          {chartRows.length >= 2 ? (
            <ValueChart rows={chartRows} />
          ) : (
            <div className="text-center py-12 text-sm text-gray-400">
              ต้องมีรายการอย่างน้อย 2 ครั้งเพื่อแสดงกราฟ
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-700">ประวัติการบันทึก</h2>
            <p className="text-xs text-gray-400 mt-0.5">{txs.length} รายการ</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="text-left px-5 py-3 font-medium">วันที่</th>
                  <th className="text-left px-5 py-3 font-medium">รายการ</th>
                  <th className="text-right px-5 py-3 font-medium">จำนวนเข้าซื้อ</th>
                  <th className="text-right px-5 py-3 font-medium">ต้นทุนสะสม</th>
                  <th className="text-right px-5 py-3 font-medium">มูลค่ารวม</th>
                  <th className="text-right px-5 py-3 font-medium">กำไร / ขาดทุน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...chartRows].reverse().map((r, i) => {
                  const isSell = r.txType === "sell";
                  const isSnapshot = r.amount === 0;
                  const pl = r.totalValue - r.cumulativeCost;
                  const plPct = r.cumulativeCost > 0 ? (pl / r.cumulativeCost) * 100 : 0;
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 text-gray-700">{fmtDate(r.date)}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isSnapshot
                            ? "bg-gray-100 text-gray-600"
                            : isSell ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"
                        }`}>
                          {isSnapshot ? "Snapshot" : isSell ? "ขาย" : "ซื้อ"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-gray-600">
                        {r.amount === 0 ? "—" : `${isSell ? "-" : "+"}฿${fmt(r.amount)}`}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-600">฿{fmt(r.cumulativeCost)}</td>
                      <td className="px-5 py-4 text-right font-medium text-gray-900">฿{fmt(r.totalValue)}</td>
                      <td className="px-5 py-4 text-right">
                        <p className={`font-medium ${pl >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {pl >= 0 ? "+" : ""}฿{fmt(pl)}
                        </p>
                        <p className={`text-xs mt-0.5 ${plPct >= 0 ? "text-green-500" : "text-red-400"}`}>
                          {plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  );
}
