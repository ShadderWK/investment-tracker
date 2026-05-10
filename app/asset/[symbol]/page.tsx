"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/log";
import { ValueChart, type ChartMarker, type ChartRow } from "@/app/_components/ValueChart";
import { Pagination } from "@/app/_components/Pagination";

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

type HistoryRow = ChartRow & { id: string; amount: number; txType: string };

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol).toUpperCase();

  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [confirmDelete, setConfirmDelete] = useState<HistoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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

  const historyRows: HistoryRow[] = useMemo(() => {
    let cum = 0;
    return txs.map((t) => {
      const delta = t.tx_type === "sell" ? -Number(t.amount) : Number(t.amount);
      cum += delta;
      return {
        id: t.id,
        x: new Date(t.date).getTime(),
        date: t.date,
        cumulativeCost: cum,
        totalValue: Number(t.total_value),
        amount: Number(t.amount),
        txType: t.tx_type,
      };
    });
  }, [txs]);

  const chartMarkers: ChartMarker[] = useMemo(
    () => historyRows.map((r) => {
      const isSell = r.txType === "sell";
      const isSnapshot = r.amount === 0;
      const color = isSnapshot ? "#9ca3af" : isSell ? "#ef4444" : "#16a34a";
      const pl = r.totalValue - r.cumulativeCost;
      return {
        x: r.x,
        y: r.totalValue,
        color,
        title: `${fmtDate(r.date)}\n${isSnapshot ? "Snapshot" : isSell ? "ขาย" : "ซื้อ"} ฿${fmt(r.amount)}\nต้นทุนรวม ฿${fmt(r.cumulativeCost)}\nมูลค่ารวม ฿${fmt(r.totalValue)}\nกำไร ${pl >= 0 ? "+" : ""}฿${fmt(pl)}`,
      };
    }),
    [historyRows]
  );

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError("");
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", confirmDelete.id);
    if (error) {
      setDeleteError("ลบไม่สำเร็จ: " + error.message);
      setDeleting(false);
      return;
    }
    await logActivity("tx_delete", {
      tx_id: confirmDelete.id,
      symbol,
      amount: confirmDelete.amount,
      date: confirmDelete.date,
    });
    const remaining = txs.filter((t) => t.id !== confirmDelete.id);
    setTxs(remaining);
    setConfirmDelete(null);
    setDeleting(false);
    if (remaining.length === 0) {
      router.push("/");
    }
  }

  const sortedHistory = useMemo(() => [...historyRows].reverse(), [historyRows]);
  const pagedHistory = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedHistory.slice(start, start + pageSize);
  }, [sortedHistory, page, pageSize]);

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
          {historyRows.length >= 2 ? (
            <ValueChart rows={historyRows} markers={chartMarkers} />
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
                  <th className="px-3 py-3 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedHistory.map((r, i) => {
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
                      <td className="px-3 py-4 text-right">
                        <button
                          onClick={() => { setDeleteError(""); setConfirmDelete(r); }}
                          aria-label="ลบรายการนี้"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
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
            total={sortedHistory.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>

      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">ลบรายการนี้?</h3>
                <p className="text-sm text-gray-500 mt-1">การลบจะไม่สามารถย้อนกลับได้</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-700 mb-4 space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">วันที่</span><span>{fmtDate(confirmDelete.date)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">รายการ</span><span>{confirmDelete.amount === 0 ? "Snapshot" : confirmDelete.txType === "sell" ? "ขาย" : "ซื้อ"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">จำนวน</span><span>{confirmDelete.amount === 0 ? "—" : `฿${fmt(confirmDelete.amount)}`}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">มูลค่ารวม</span><span>฿{fmt(confirmDelete.totalValue)}</span></div>
            </div>

            {deleteError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                {deleteError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg transition"
              >
                {deleting ? "กำลังลบ..." : "ลบรายการนี้"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
