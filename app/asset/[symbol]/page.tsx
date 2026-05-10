"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Transaction = {
  id: string;
  symbol: string;
  asset_type: string;
  tx_type: string;
  price: number;
  qty: number;
  current_price: number;
  date: string;
};

const TYPE_LABEL: Record<string, string> = {
  stock: "หุ้น", crypto: "คริปโต", gold: "ทองคำ", etf: "ETF",
};

const TYPE_COLOR: Record<string, string> = {
  stock: "bg-blue-100 text-blue-700",
  crypto: "bg-purple-100 text-purple-700",
  gold: "bg-amber-100 text-amber-700",
  etf: "bg-green-100 text-green-700",
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

type ChartPoint = { x: number; y: number; date: string; tx: Transaction };

function PriceChart({ points }: { points: ChartPoint[] }) {
  const W = 720;
  const H = 280;
  const PAD = { top: 20, right: 20, bottom: 36, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (points.length === 0) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const yPad = (yMax - yMin) * 0.1 || yMax * 0.1 || 1;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const sx = (x: number) =>
    xMax === xMin ? PAD.left + innerW / 2 : PAD.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const sy = (y: number) => PAD.top + innerH - ((y - yLo) / (yHi - yLo)) * innerH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`).join(" ");
  const areaPath =
    `M ${sx(points[0].x)} ${PAD.top + innerH} ` +
    points.map((p) => `L ${sx(p.x)} ${sy(p.y)}`).join(" ") +
    ` L ${sx(points[points.length - 1].x)} ${PAD.top + innerH} Z`;

  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yLo + ((yHi - yLo) * i) / yTicks);
  const xTickCount = Math.min(5, points.length);
  const xTickIdx = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((i * (points.length - 1)) / Math.max(1, xTickCount - 1))
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
          <line
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={sy(v)}
            y2={sy(v)}
            stroke="#e5e7eb"
            strokeDasharray="3 3"
          />
          <text
            x={PAD.left - 8}
            y={sy(v) + 4}
            textAnchor="end"
            fontSize="10"
            fill="#6b7280"
          >
            ฿{v.toFixed(0)}
          </text>
        </g>
      ))}

      <path d={areaPath} fill="url(#areaFill)" />
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth="2" />

      {points.map((p, i) => {
        const isBuy = p.tx.tx_type === "buy";
        return (
          <g key={`pt-${i}`}>
            <circle
              cx={sx(p.x)}
              cy={sy(p.y)}
              r="5"
              fill={isBuy ? "#16a34a" : "#ef4444"}
              stroke="white"
              strokeWidth="2"
            >
              <title>
                {`${isBuy ? "ซื้อ" : "ขาย"} ${p.tx.qty} หน่วย @ ฿${fmt(p.tx.price)}\nราคาตลาด ฿${fmt(p.y)}\n${fmtDate(p.date)}`}
              </title>
            </circle>
          </g>
        );
      })}

      {xTickIdx.map((idx, i) => {
        const p = points[idx];
        return (
          <text
            key={`x-${i}`}
            x={sx(p.x)}
            y={H - 12}
            textAnchor="middle"
            fontSize="10"
            fill="#6b7280"
          >
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

      const list = data || [];
      if (list.length === 0) setNotFound(true);
      setTxs(list);
      setLoading(false);
    })();
  }, [symbol, router]);

  const summary = useMemo(() => {
    let qty = 0, totalCost = 0;
    let lastPrice = 0;
    let assetType = "";
    txs.forEach((t) => {
      assetType = t.asset_type;
      lastPrice = t.current_price;
      if (t.tx_type === "buy") {
        qty += t.qty;
        totalCost += t.price * t.qty;
      } else {
        qty -= t.qty;
        totalCost -= t.price * t.qty;
      }
    });
    const avgCost = qty > 0 ? totalCost / qty : 0;
    const marketValue = qty * lastPrice;
    const pl = marketValue - totalCost;
    const plPct = totalCost > 0 ? (pl / totalCost) * 100 : 0;
    return { qty, totalCost, avgCost, lastPrice, marketValue, pl, plPct, assetType };
  }, [txs]);

  const chartPoints: ChartPoint[] = useMemo(
    () => txs.map((t) => ({ x: new Date(t.date).getTime(), y: t.current_price, date: t.date, tx: t })),
    [txs]
  );

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
              <p className="text-xs text-gray-500 mt-0.5">รายละเอียดสินทรัพย์</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "จำนวนที่ถือ", value: summary.qty % 1 === 0 ? `${summary.qty}` : summary.qty.toFixed(4), color: "text-gray-900" },
            { label: "ราคาเฉลี่ย/หน่วย", value: `฿${fmt(summary.avgCost)}`, color: "text-gray-900" },
            { label: "ราคาตลาดล่าสุด", value: `฿${fmt(summary.lastPrice)}`, color: "text-gray-900" },
            { label: "กำไร / ขาดทุน",
              value: `${summary.pl >= 0 ? "+" : ""}฿${fmt(summary.pl)} (${summary.plPct >= 0 ? "+" : ""}${summary.plPct.toFixed(2)}%)`,
              color: summary.pl >= 0 ? "text-green-600" : "text-red-500" },
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
              <h2 className="text-sm font-medium text-gray-700">กราฟราคาตลาด</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                ราคาตลาดที่บันทึกในแต่ละครั้ง · จุดสีแสดงรายการซื้อ/ขาย
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-600" />ซื้อ
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />ขาย
              </span>
            </div>
          </div>
          {chartPoints.length >= 2 ? (
            <PriceChart points={chartPoints} />
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
                  <th className="text-left px-5 py-3 font-medium">ประเภท</th>
                  <th className="text-right px-5 py-3 font-medium">จำนวน</th>
                  <th className="text-right px-5 py-3 font-medium">ราคา/หน่วย</th>
                  <th className="text-right px-5 py-3 font-medium">มูลค่ารายการ</th>
                  <th className="text-right px-5 py-3 font-medium">ราคาตลาดขณะนั้น</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...txs].reverse().map((t) => {
                  const isBuy = t.tx_type === "buy";
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 text-gray-700">{fmtDate(t.date)}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isBuy ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}>
                          {isBuy ? "ซื้อ" : "ขาย"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-gray-600">
                        {t.qty % 1 === 0 ? t.qty : t.qty.toFixed(4)}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-600">฿{fmt(t.price)}</td>
                      <td className="px-5 py-4 text-right font-medium text-gray-900">
                        ฿{fmt(t.price * t.qty)}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-500">฿{fmt(t.current_price)}</td>
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
