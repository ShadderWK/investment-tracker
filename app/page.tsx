"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ValueChart, type ChartRow } from "./_components/ValueChart";
import { Pagination } from "./_components/Pagination";

type Transaction = {
  id: string;
  symbol: string;
  asset_type: string;
  tx_type: string;
  amount: number;
  total_value: number;
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

function computeAssets(transactions: Transaction[]): Asset[] {
  const map: Record<string, Asset & { lastDate: string }> = {};
  transactions.forEach((tx) => {
    const sym = tx.symbol;
    if (!map[sym]) {
      map[sym] = {
        symbol: sym, assetType: tx.asset_type,
        totalCost: 0, currentValue: 0, pl: 0, plPct: 0, txCount: 0,
        lastDate: "",
      };
    }
    const a = map[sym];
    const delta = tx.tx_type === "sell" ? -Number(tx.amount) : Number(tx.amount);
    a.totalCost += delta;
    a.txCount += 1;
    if (tx.date >= a.lastDate) {
      a.currentValue = Number(tx.total_value);
      a.lastDate = tx.date;
    }
  });
  return Object.values(map).map((a) => ({
    symbol: a.symbol, assetType: a.assetType,
    totalCost: a.totalCost, currentValue: a.currentValue, txCount: a.txCount,
    pl: a.currentValue - a.totalCost,
    plPct: a.totalCost > 0 ? ((a.currentValue - a.totalCost) / a.totalCost) * 100 : 0,
  }));
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

    if (data) setTransactions(data as Transaction[]);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    localStorage.removeItem("login_time");
    localStorage.removeItem("portfolio_id");
    router.replace("/login");
  }

  const assets = useMemo(() => computeAssets(transactions), [transactions]);
  const series = useMemo(() => computePortfolioSeries(transactions), [transactions]);
  const sortedAssets = useMemo(
    () => [...assets].sort((a, b) => b.currentValue - a.currentValue),
    [assets]
  );
  const pagedAssets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedAssets.slice(start, start + pageSize);
  }, [sortedAssets, page, pageSize]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">กำลังโหลดข้อมูล...</p>
      </main>
    );
  }

  const totalValue = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalCost = assets.reduce((s, a) => s + a.totalCost, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Portfolio Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">ภาพรวมการลงทุนของคุณ</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{userName}</p>
              <p className="text-xs text-gray-400">{userEmail}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-3 py-2 text-sm text-gray-600 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg transition disabled:opacity-50"
            >
              {loggingOut ? "กำลังออก..." : "ออกจากระบบ"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "มูลค่ารวม", value: `฿${fmt(totalValue)}`, color: "text-gray-900" },
            { label: "ต้นทุนรวม", value: `฿${fmt(totalCost)}`, color: "text-gray-900" },
            { label: "กำไร / ขาดทุน", value: `${totalPL >= 0 ? "+" : ""}฿${fmt(totalPL)}`, color: totalPL >= 0 ? "text-green-600" : "text-red-500" },
            { label: "ผลตอบแทน", value: `${totalPLPct >= 0 ? "+" : ""}${totalPLPct.toFixed(2)}%`, color: totalPLPct >= 0 ? "text-green-600" : "text-red-500" },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">{m.label}</p>
              <p className={`text-xl font-semibold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {series.length >= 2 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-medium text-gray-700">ภาพรวมพอร์ตตามเวลา</h2>
                <p className="text-xs text-gray-400 mt-0.5">รวมทุกสินทรัพย์ · เส้นน้ำเงิน = มูลค่าตลาด · เส้นเทาประ = ต้นทุนสะสม</p>
              </div>
            </div>
            <ValueChart rows={series} />
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-700">สินทรัพย์ทั้งหมด</h2>
              <p className="text-xs text-gray-400 mt-0.5">{assets.length} รายการ</p>
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
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm font-medium text-gray-500">ยังไม่มีสินทรัพย์</p>
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
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="text-left px-5 py-3 font-medium">ชื่อสินทรัพย์</th>
                      <th className="text-right px-5 py-3 font-medium">รายการ</th>
                      <th className="text-right px-5 py-3 font-medium">ต้นทุนรวม</th>
                      <th className="text-right px-5 py-3 font-medium">มูลค่าปัจจุบัน</th>
                      <th className="text-right px-5 py-3 font-medium">กำไร/ขาดทุน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedAssets.map((a) => (
                      <tr
                        key={a.symbol}
                        onClick={() => router.push(`/asset/${encodeURIComponent(a.symbol)}`)}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                              {a.symbol.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{a.symbol}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[a.assetType] || "bg-gray-100 text-gray-600"}`}>
                                {TYPE_LABEL[a.assetType] || a.assetType}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right text-gray-600">{a.txCount}</td>
                        <td className="px-5 py-4 text-right text-gray-600">฿{fmt(a.totalCost)}</td>
                        <td className="px-5 py-4 text-right font-medium text-gray-900">฿{fmt(a.currentValue)}</td>
                        <td className="px-5 py-4 text-right">
                          <p className={`font-medium ${a.pl >= 0 ? "text-green-600" : "text-red-500"}`}>
                            {a.pl >= 0 ? "+" : ""}฿{fmt(a.pl)}
                          </p>
                          <p className={`text-xs mt-0.5 ${a.plPct >= 0 ? "text-green-500" : "text-red-400"}`}>
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

      </div>
    </main>
  );
}
