"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "@/lib/admin-fetch";
import { Pagination } from "@/app/_components/Pagination";
import { ValueChart, type ChartRow } from "@/app/_components/ValueChart";
import { PieChart, type PieSlice } from "@/app/_components/PieChart";

type Transaction = {
  id: string;
  symbol: string;
  asset_type: string;
  tx_type: string;
  amount: number;
  total_value: number;
  date: string;
};

type User = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  user_metadata?: { full_name?: string };
};

type Portfolio = { id: string; name: string };

const TYPE_LABEL: Record<string, string> = {
  stock: "หุ้น", crypto: "คริปโต", gold: "ทองคำ", etf: "ETF", fund: "กองทุน",
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartView, setChartView] = useState<"timeline" | "allocation">("timeline");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch(`/api/admin/users/${userId}`);
      setUser(data.user);
      setPortfolios(data.portfolios || []);
      setTxs(data.transactions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  async function handleDeleteTx() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await adminFetch(`/api/admin/transactions/${confirmDelete.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  const assets = useMemo(() => {
    const map: Record<string, { symbol: string; type: string; cost: number; value: number; lastDate: string }> = {};
    txs.forEach((t) => {
      if (!map[t.symbol]) map[t.symbol] = { symbol: t.symbol, type: t.asset_type, cost: 0, value: 0, lastDate: "" };
      const a = map[t.symbol];
      const delta = t.tx_type === "sell" ? -Number(t.amount) : Number(t.amount);
      a.cost += delta;
      if (t.date >= a.lastDate) { a.value = Number(t.total_value); a.lastDate = t.date; }
    });
    return Object.values(map);
  }, [txs]);

  const series: ChartRow[] = useMemo(() => {
    if (txs.length === 0) return [];
    const sortedTx = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const dates = Array.from(new Set(sortedTx.map((t) => t.date))).sort();
    let cum = 0;
    let i = 0;
    const latest: Record<string, number> = {};
    return dates.map((d) => {
      while (i < sortedTx.length && sortedTx[i].date <= d) {
        const t = sortedTx[i];
        cum += t.tx_type === "sell" ? -Number(t.amount) : Number(t.amount);
        latest[t.symbol] = Number(t.total_value);
        i++;
      }
      return {
        x: new Date(d).getTime(),
        date: d,
        cumulativeCost: cum,
        totalValue: Object.values(latest).reduce((s, v) => s + v, 0),
      };
    });
  }, [txs]);

  const pieSlices: PieSlice[] = useMemo(
    () => assets
      .filter((a) => a.value > 0)
      .map((a) => ({ label: a.symbol, sublabel: TYPE_LABEL[a.type] || a.type, value: a.value })),
    [assets]
  );

  const sortedTxs = useMemo(() => [...txs].sort((a, b) => b.date.localeCompare(a.date)), [txs]);
  const pagedTxs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedTxs.slice(start, start + pageSize);
  }, [sortedTxs, page, pageSize]);

  const totalCost = assets.reduce((s, a) => s + a.cost, 0);
  const totalValue = assets.reduce((s, a) => s + a.value, 0);
  const pl = totalValue - totalCost;
  const plPct = totalCost > 0 ? (pl / totalCost) * 100 : 0;

  if (loading) {
    return <p className="text-sm text-gray-500 text-center py-12">กำลังโหลด...</p>;
  }
  if (error || !user) {
    return (
      <div>
        <Link href="/admin/users" className="text-sm text-gray-400 hover:text-gray-100">← Users</Link>
        <p className="text-sm text-red-400 bg-red-950 border border-red-900 rounded-lg px-3 py-2 mt-3">
          {error || "User not found"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/admin/users" className="text-sm text-gray-400 hover:text-gray-100">← กลับไป Users</Link>

      <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 mt-3 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">{user.email}</h1>
            <p className="text-xs text-gray-400 mt-1">
              {user.user_metadata?.full_name && <>ชื่อ: {user.user_metadata.full_name} · </>}
              สมัคร: {fmtDateTime(user.created_at)} · Login ล่าสุด: {fmtDateTime(user.last_sign_in_at)}
            </p>
            <p className="text-[11px] text-gray-500 mt-1 font-mono">{user.id}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: "สินทรัพย์", value: `${assets.length}`, color: "text-gray-50" },
          { label: "ต้นทุนรวม", value: `฿${fmt(totalCost)}`, color: "text-gray-50" },
          { label: "มูลค่าปัจจุบัน", value: `฿${fmt(totalValue)}`, color: "text-gray-50" },
          { label: "P/L", value: `${pl >= 0 ? "+" : ""}฿${fmt(pl)} (${plPct >= 0 ? "+" : ""}${plPct.toFixed(2)}%)`,
            color: pl >= 0 ? "text-green-400" : "text-red-400" },
        ].map((m) => (
          <div key={m.label} className="bg-gray-900 rounded-xl border border-gray-700 p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-base font-semibold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {(series.length >= 2 || pieSlices.length > 0) && (
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 mb-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-sm font-medium text-gray-300">
              {chartView === "timeline" ? "ภาพรวมพอร์ตตามเวลา" : "อัตราส่วนสินทรัพย์"}
            </h2>
            <div className="inline-flex bg-gray-800 rounded-lg p-0.5">
              <button onClick={() => setChartView("timeline")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${chartView === "timeline" ? "bg-gray-600 text-gray-50 shadow-sm" : "text-gray-400"}`}>
                ตามเวลา
              </button>
              <button onClick={() => setChartView("allocation")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${chartView === "allocation" ? "bg-gray-600 text-gray-50 shadow-sm" : "text-gray-400"}`}>
                อัตราส่วน
              </button>
            </div>
          </div>
          {chartView === "timeline" ? (
            series.length >= 2 ? <ValueChart rows={series} /> : <p className="text-center py-8 text-sm text-gray-500">ข้อมูลไม่พอ</p>
          ) : (
            <PieChart slices={pieSlices} />
          )}
        </div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-medium text-gray-300">Transactions ทั้งหมด</h2>
          <p className="text-xs text-gray-500 mt-0.5">{txs.length} รายการ · {portfolios.length} portfolio</p>
        </div>
        {txs.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">user นี้ยังไม่มี transaction</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-xs text-gray-400">
                    <th className="text-left px-5 py-3 font-medium">วันที่</th>
                    <th className="text-left px-5 py-3 font-medium">Symbol</th>
                    <th className="text-left px-5 py-3 font-medium">รายการ</th>
                    <th className="text-right px-5 py-3 font-medium">จำนวน</th>
                    <th className="text-right px-5 py-3 font-medium">มูลค่ารวม</th>
                    <th className="px-3 py-3 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {pagedTxs.map((t) => {
                    const isSell = t.tx_type === "sell";
                    const isSnap = Number(t.amount) === 0;
                    return (
                      <tr key={t.id} className="hover:bg-gray-800">
                        <td className="px-5 py-3 text-gray-300">{fmtDate(t.date)}</td>
                        <td className="px-5 py-3 font-medium text-gray-100">{t.symbol}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            isSnap ? "bg-gray-800 text-gray-300" : isSell ? "bg-red-900/50 text-red-300" : "bg-green-900/50 text-green-300"
                          }`}>
                            {isSnap ? "Snapshot" : isSell ? "ขาย" : "ซื้อ"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-gray-400">
                          {Number(t.amount) === 0 ? "—" : `${isSell ? "-" : "+"}฿${fmt(Number(t.amount))}`}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-gray-100">฿{fmt(Number(t.total_value))}</td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => setConfirmDelete(t)}
                            className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-400 hover:bg-red-900/20"
                            aria-label="ลบ"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              total={sortedTxs.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div className="bg-gray-900 rounded-2xl shadow-xl border border-gray-700 max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-100 mb-2">ลบ transaction นี้?</h3>
            <div className="bg-gray-800 rounded-lg px-3 py-2.5 text-xs space-y-1 mb-4">
              <div className="flex justify-between"><span className="text-gray-400">Symbol</span><span className="text-gray-200">{confirmDelete.symbol}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">วันที่</span><span className="text-gray-200">{fmtDate(confirmDelete.date)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">จำนวน</span><span className="text-gray-200">฿{fmt(Number(confirmDelete.amount))}</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={handleDeleteTx} disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg">
                {deleting ? "กำลังลบ..." : "ลบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
