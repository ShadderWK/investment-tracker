"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/log";
import { isAdmin } from "@/lib/admin";
import { isLive } from "@/lib/asset-sources";
import { ValueChart, type ChartRow } from "./_components/ValueChart";
import { PieChart, type PieSlice } from "./_components/PieChart";
import { Pagination } from "./_components/Pagination";

type Transaction = {
  id: string;
  symbol: string;
  asset_type: string;
  tx_type: string;
  amount: number;
  total_value: number;
  units: number | null;
  date: string;
};

type Asset = {
  symbol: string;
  assetType: string;
  totalCost: number;
  currentValue: number;
  pl: number;
  plPct: number;
  txCount: number;
  lastDate: string;
  latestUnits: number | null;
};

const TYPE_LABEL: Record<string, string> = {
  stock: "หุ้น", crypto: "คริปโต", gold: "ทองคำ", etf: "ETF", fund: "กองทุน",
};

const TYPE_COLOR: Record<string, string> = {
  stock: "bg-blue-900/50 text-blue-300",
  crypto: "bg-purple-900/50 text-purple-300",
  gold: "bg-amber-900/50 text-amber-300",
  etf: "bg-green-900/50 text-green-300",
  fund: "bg-indigo-900/50 text-indigo-300",
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeAssets(transactions: Transaction[]): Asset[] {
  const assetMap: Record<string, { totalCost: number; currentValue: number; txCount: number; lastDate: string; assetType: string }> = {};
  const unitsSumMap: Record<string, number> = {};
  const hasUnitsMap: Record<string, boolean> = {};

  transactions.forEach((tx) => {
    const sym = tx.symbol;
    if (!assetMap[sym]) {
      assetMap[sym] = { totalCost: 0, currentValue: 0, txCount: 0, lastDate: "", assetType: tx.asset_type };
    }
    const a = assetMap[sym];
    const delta = tx.tx_type === "sell" ? -Number(tx.amount) : Number(tx.amount);
    a.totalCost += delta;
    a.txCount += 1;
    if (tx.date >= a.lastDate) {
      a.currentValue = Number(tx.total_value);
      a.lastDate = tx.date;
    }
    if (tx.units != null) {
      hasUnitsMap[sym] = true;
      const unitDelta = tx.tx_type === "sell" ? -tx.units : tx.units;
      unitsSumMap[sym] = (unitsSumMap[sym] ?? 0) + unitDelta;
    }
  });

  return Object.entries(assetMap).map(([sym, a]) => {
    const pl = a.currentValue - a.totalCost;
    return {
      symbol: sym,
      assetType: a.assetType,
      totalCost: a.totalCost,
      currentValue: a.currentValue,
      pl,
      plPct: a.totalCost > 0 ? (pl / a.totalCost) * 100 : 0,
      txCount: a.txCount,
      lastDate: a.lastDate,
      latestUnits: hasUnitsMap[sym] ? unitsSumMap[sym] : null,
    };
  });
}

function computePortfolioSeries(transactions: Transaction[]): ChartRow[] {
  if (transactions.length === 0) return [];

  const bySymbol: Record<string, Transaction[]> = {};
  transactions.forEach((t) => {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
    bySymbol[t.symbol].push(t);
  });
  Object.values(bySymbol).forEach((list) => list.sort((a, b) => a.date.localeCompare(b.date)));

  const sortedTx = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const uniqueDates = Array.from(new Set(sortedTx.map((t) => t.date))).sort();

  let cumCost = 0;
  let txIdx = 0;
  const latestValue: Record<string, number> = {};

  return uniqueDates.map((date) => {
    while (txIdx < sortedTx.length && sortedTx[txIdx].date <= date) {
      const t = sortedTx[txIdx];
      const delta = t.tx_type === "sell" ? -Number(t.amount) : Number(t.amount);
      cumCost += delta;
      latestValue[t.symbol] = Number(t.total_value);
      txIdx++;
    }
    const totalValue = Object.values(latestValue).reduce((s, v) => s + v, 0);
    return {
      x: new Date(date).getTime(),
      date,
      cumulativeCost: cumCost,
      totalValue,
    };
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [chartView, setChartView] = useState<"timeline" | "allocation">("timeline");
  const [chartRange, setChartRange] = useState<"1d" | "1w" | "1m" | "3m" | "6m" | "1y" | "all">("all");
  const [admin, setAdmin] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [livePriceError, setLivePriceError] = useState("");
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [pricesFetchedAt, setPricesFetchedAt] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<ChartRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const SESSION_DURATION = 60 * 60 * 1000;

  useEffect(() => {
    checkSessionAndLoad();
  }, []);

  async function checkSessionAndLoad() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    const loginTime = localStorage.getItem("login_time");
    if (loginTime && Date.now() - parseInt(loginTime) > SESSION_DURATION) {
      await supabase.auth.signOut();
      localStorage.removeItem("login_time");
      router.replace("/login");
      return;
    }
    if (!loginTime) localStorage.setItem("login_time", Date.now().toString());

    const user = session.user;
    setUserEmail(user.email || "");
    setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "User");
    setAdmin(isAdmin(user.email));
    await loadTransactions(user.id);
    setLoading(false);
  }

  async function loadTransactions(userId: string) {
    const { data: portfolios } = await supabase
      .from("portfolios").select("id").eq("user_id", userId);

    if (!portfolios || portfolios.length === 0) {
      const { data: newPortfolio } = await supabase
        .from("portfolios")
        .insert({ user_id: userId, name: "My Portfolio" })
        .select().single();
      if (newPortfolio) localStorage.setItem("portfolio_id", newPortfolio.id);
      setTransactions([]);
      return;
    }

    const portfolioId = portfolios[0].id;
    localStorage.setItem("portfolio_id", portfolioId);

    const { data } = await supabase
      .from("transactions").select("*")
      .eq("portfolio_id", portfolioId)
      .order("date", { ascending: true });

    if (data) {
      const txList = data as Transaction[];
      setTransactions(txList);
      fetchHistory(txList); // non-blocking — updates chart when daily data arrives
    }
  }

  async function fetchHistory(txList: Transaction[]) {
    if (txList.length === 0) { setHistoryRows([]); return; }
    setHistoryLoading(true);
    try {
      // Group transactions by symbol
      const bySymbol: Record<string, { symbol: string; transactions: unknown[] }> = {};
      txList.forEach((tx) => {
        if (!bySymbol[tx.symbol]) bySymbol[tx.symbol] = { symbol: tx.symbol, transactions: [] };
        bySymbol[tx.symbol].transactions.push({
          date: tx.date,
          units: tx.units,
          tx_type: tx.tx_type,
          amount: tx.amount,
          total_value: tx.total_value,
        });
      });
      const sorted = [...txList].sort((a, b) => a.date.localeCompare(b.date));
      const startDate = sorted[0].date;
      const endDate = new Date().toISOString().split("T")[0];

      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets: Object.values(bySymbol), startDate, endDate }),
      });
      if (!res.ok) return; // silently fall back to sparse chart

      const data = await res.json();
      const rows: ChartRow[] = (data.dates as string[]).map((date: string, i: number) => ({
        x: new Date(date).getTime(),
        date,
        cumulativeCost: (data.totalCost as number[])[i],
        totalValue: (data.totalValue as number[])[i],
      }));
      // Trim leading all-zero rows (before first transaction takes effect)
      const first = rows.findIndex((r) => r.totalValue > 0 || r.cumulativeCost > 0);
      setHistoryRows(first >= 0 ? rows.slice(first) : rows);
    } catch {
      // silently ignore — sparse chart remains as fallback
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logActivity("logout");
    await supabase.auth.signOut();
    localStorage.removeItem("login_time");
    localStorage.removeItem("portfolio_id");
    router.replace("/login");
  }

  const baseAssets = useMemo(() => computeAssets(transactions), [transactions]);
  const assets = useMemo(
    () => baseAssets.map((a) => {
      const live = livePrices[a.symbol];
      if (live == null) return a;
      const pl = live - a.totalCost;
      return {
        ...a,
        currentValue: live,
        pl,
        plPct: a.totalCost > 0 ? (pl / a.totalCost) * 100 : 0,
      };
    }),
    [baseAssets, livePrices]
  );

  async function refreshPrices() {
    setRefreshingPrices(true);
    setLivePriceError("");
    try {
      const items = baseAssets
        .filter((a) => isLive(a.symbol) && a.lastDate)
        .map((a) => ({
          symbol: a.symbol,
          snapshotDate: a.lastDate,
          snapshotValue: a.currentValue,
          ...(a.latestUnits != null ? { units: a.latestUnits } : {}),
        }));
      if (items.length === 0) {
        setLivePriceError("ไม่มีสินทรัพย์ที่รองรับ live price ในพอร์ตนี้");
        return;
      }
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const next: Record<string, number> = {};
      (data.prices as { symbol: string; liveValue: number | null }[]).forEach((p) => {
        if (p.liveValue != null) next[p.symbol] = p.liveValue;
      });
      setLivePrices(next);
      setPricesFetchedAt(data.fetched_at);
    } catch (e) {
      setLivePriceError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshingPrices(false);
    }
  }
  const series = useMemo(() => {
    if (historyRows && historyRows.length > 0) return historyRows;
    return computePortfolioSeries(transactions);
  }, [historyRows, transactions]);
  const filteredSeries = useMemo(() => {
    if (chartRange === "all") return series;
    const days = { "1d": 1, "1w": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365 }[chartRange];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return series.filter((r) => r.x >= cutoff);
  }, [series, chartRange]);
  const sortedAssets = useMemo(
    () => [...assets].sort((a, b) => b.currentValue - a.currentValue),
    [assets]
  );
  const pagedAssets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedAssets.slice(start, start + pageSize);
  }, [sortedAssets, page, pageSize]);
  const pieSlices: PieSlice[] = useMemo(
    () => sortedAssets
      .filter((a) => a.currentValue > 0)
      .map((a) => ({
        label: a.symbol,
        sublabel: TYPE_LABEL[a.assetType] || a.assetType,
        value: a.currentValue,
      })),
    [sortedAssets]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">กำลังโหลดข้อมูล...</p>
      </main>
    );
  }

  const totalValue = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalCost = assets.reduce((s, a) => s + a.totalCost, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-50">Portfolio Dashboard</h1>
            <p className="text-sm text-gray-400 mt-1">ภาพรวมการลงทุนของคุณ</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-100">{userName}</p>
              <p className="text-xs text-gray-500">{userEmail}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            {admin && (
              <Link
                href="/admin"
                className="px-3 py-2 text-sm text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              >
                Admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-3 py-2 text-sm text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-700 rounded-lg transition disabled:opacity-50"
            >
              {loggingOut ? "กำลังออก..." : "ออกจากระบบ"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mb-3">
          {pricesFetchedAt && (
            <span className="text-xs text-gray-500">
              อัปเดตเมื่อ {new Date(pricesFetchedAt).toLocaleTimeString("th-TH")}
            </span>
          )}
          <button
            onClick={refreshPrices}
            disabled={refreshingPrices}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-700 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 disabled:opacity-50 transition"
          >
            <svg className={`w-3.5 h-3.5 ${refreshingPrices ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshingPrices ? "กำลังดึง..." : "ดึงราคาล่าสุด"}
          </button>
        </div>

        {livePriceError && (
          <p className="text-xs text-amber-300 bg-amber-950 border border-amber-800 rounded-lg px-3 py-2 mb-3">
            {livePriceError}
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "มูลค่ารวม", value: `฿${fmt(totalValue)}`, color: "text-gray-50" },
            { label: "ต้นทุนรวม", value: `฿${fmt(totalCost)}`, color: "text-gray-50" },
            { label: "กำไร / ขาดทุน", value: `${totalPL >= 0 ? "+" : ""}฿${fmt(totalPL)}`, color: totalPL >= 0 ? "text-green-400" : "text-red-400" },
            { label: "ผลตอบแทน", value: `${totalPLPct >= 0 ? "+" : ""}${totalPLPct.toFixed(2)}%`, color: totalPLPct >= 0 ? "text-green-400" : "text-red-400" },
          ].map((m) => (
            <div key={m.label} className="bg-gray-900 rounded-xl border border-gray-700 p-4">
              <p className="text-xs text-gray-400 mb-1">{m.label}</p>
              <p className={`text-xl font-semibold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {(series.length >= 2 || pieSlices.length > 0) && (
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 mb-6">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-gray-300">
                  {chartView === "timeline" ? "ภาพรวมพอร์ตตามเวลา" : "อัตราส่วนสินทรัพย์"}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {chartView === "timeline"
                    ? "รวมทุกสินทรัพย์ · ชี้เพื่อดูค่า ณ จุดนั้น"
                    : "ตามมูลค่าปัจจุบัน · ชี้สไลซ์เพื่อดูรายละเอียด"}
                </p>
              </div>
              <div className="inline-flex bg-gray-800 rounded-lg p-0.5 shrink-0">
                <button
                  onClick={() => setChartView("timeline")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    chartView === "timeline"
                      ? "bg-gray-600 text-gray-50 shadow-sm"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  ตามเวลา
                </button>
                <button
                  onClick={() => setChartView("allocation")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    chartView === "allocation"
                      ? "bg-gray-600 text-gray-50 shadow-sm"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  อัตราส่วน
                </button>
              </div>
            </div>
            {chartView === "timeline" && (
              <div className="flex items-center gap-1 mb-3 flex-wrap">
                {(["1d", "1w", "1m", "3m", "6m", "1y", "all"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setChartRange(r)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                      chartRange === r
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                    }`}
                  >
                    {{ "1d": "1D", "1w": "1W", "1m": "1M", "3m": "3M", "6m": "6M", "1y": "1Y", "all": "ทั้งหมด" }[r]}
                  </button>
                ))}
                {historyLoading && (
                  <span className="flex items-center gap-1 text-xs text-gray-500 ml-2">
                    <svg className="w-3 h-3 animate-spin shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    กำลังโหลดกราฟรายวัน...
                  </span>
                )}
                {!historyLoading && historyRows && historyRows.length > 0 && (
                  <span className="text-[10px] text-gray-600 ml-2">รายวัน</span>
                )}
              </div>
            )}
            {chartView === "timeline" ? (
              filteredSeries.length >= 2 ? (
                <ValueChart rows={filteredSeries} />
              ) : filteredSeries.length === 0 && series.length >= 2 ? (
                <div className="text-center py-12 text-sm text-gray-500">
                  ไม่มีข้อมูลในช่วงเวลานี้
                </div>
              ) : (
                <div className="text-center py-12 text-sm text-gray-500">
                  ต้องมีข้อมูลอย่างน้อย 2 จุดเพื่อแสดงกราฟตามเวลา
                </div>
              )
            ) : (
              <PieChart slices={pieSlices} />
            )}
          </div>
        )}

        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-300">สินทรัพย์ทั้งหมด</h2>
              <p className="text-xs text-gray-500 mt-0.5">{assets.length} รายการ</p>
            </div>
            <button
              onClick={() => router.push("/add")}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              เพิ่มการลงทุน
            </button>
          </div>

          {assets.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm font-medium text-gray-400">ยังไม่มีสินทรัพย์</p>
              <p className="text-xs mt-1 mb-4">กดปุ่ม &quot;เพิ่มการลงทุน&quot; เพื่อเริ่มต้นบันทึกพอร์ต</p>
              <button
                onClick={() => router.push("/add")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
              >
                + เพิ่มการลงทุนแรก
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-800 text-xs text-gray-400">
                      <th className="text-left px-5 py-3 font-medium">ชื่อสินทรัพย์</th>
                      <th className="text-right px-5 py-3 font-medium">รายการ</th>
                      <th className="text-right px-5 py-3 font-medium">ต้นทุนรวม</th>
                      <th className="text-right px-5 py-3 font-medium">มูลค่าปัจจุบัน</th>
                      <th className="text-right px-5 py-3 font-medium">กำไร/ขาดทุน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {pagedAssets.map((a) => (
                      <tr
                        key={a.symbol}
                        onClick={() => router.push(`/asset/${encodeURIComponent(a.symbol)}`)}
                        className="hover:bg-gray-800 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-semibold text-gray-300">
                              {a.symbol.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-gray-100">{a.symbol}</p>
                                {livePrices[a.symbol] != null && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/50 text-green-300 font-semibold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    LIVE
                                  </span>
                                )}
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[a.assetType] || "bg-gray-800 text-gray-300"}`}>
                                {TYPE_LABEL[a.assetType] || a.assetType}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right text-gray-400">{a.txCount}</td>
                        <td className="px-5 py-4 text-right text-gray-400">฿{fmt(a.totalCost)}</td>
                        <td className="px-5 py-4 text-right font-medium text-gray-100">฿{fmt(a.currentValue)}</td>
                        <td className="px-5 py-4 text-right">
                          <p className={`font-medium ${a.pl >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {a.pl >= 0 ? "+" : ""}฿{fmt(a.pl)}
                          </p>
                          <p className={`text-xs mt-0.5 ${a.plPct >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {a.plPct >= 0 ? "+" : ""}{a.plPct.toFixed(2)}%
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                total={sortedAssets.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-700 mt-8">
          สร้างโดย <span className="text-gray-500 font-medium">ShadderWK</span>
        </p>

      </div>
    </main>
  );
}
