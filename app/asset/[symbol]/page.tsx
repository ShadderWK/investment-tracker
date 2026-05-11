"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/log";
import { isLive } from "@/lib/asset-sources";
import { ValueChart, type ChartMarker, type ChartRow } from "@/app/_components/ValueChart";
import { Pagination } from "@/app/_components/Pagination";

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

const UNITS_LABEL: Record<string, string> = {
  fund: "หน่วยลงทุน", etf: "หน่วย", stock: "หุ้น", crypto: "เหรียญ", gold: "oz",
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUnits(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

function fmtDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

type HistoryRow = ChartRow & { id: string; amount: number; txType: string; units: number | null };

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
  const [chartRange, setChartRange] = useState<"1m" | "3m" | "6m" | "1y" | "all">("all");
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState({ tx_type: "buy", amount: "", total_value: "", date: "", units: "" });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [liveValue, setLiveValue] = useState<number | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [liveFetching, setLiveFetching] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveFetchedAt, setLiveFetchedAt] = useState<string | null>(null);

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
      if (list.length === 0) { setNotFound(true); setLoading(false); return; }
      setTxs(list);
      setLoading(false);

      // Auto-fetch live price on load
      if (isLive(symbol)) {
        const lastTx = list[list.length - 1];
        const latestUnits = list.reduce<{ units: number | null; date: string }>(
          (acc, t) => (t.units != null && t.date >= acc.date ? { units: t.units, date: t.date } : acc),
          { units: null, date: "" }
        ).units;
        setLiveFetching(true);
        try {
          const res = await fetch("/api/prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: [{
                symbol,
                snapshotDate: lastTx.date,
                snapshotValue: Number(lastTx.total_value),
                ...(latestUnits != null ? { units: latestUnits } : {}),
              }],
            }),
          });
          if (res.ok) {
            const json = await res.json();
            const p = json.prices?.[0];
            if (p?.liveValue != null) setLiveValue(p.liveValue);
            if (p?.currentPrice != null) setCurrentPrice(p.currentPrice);
            if (p?.error) setLiveError(p.error);
            setLiveFetchedAt(json.fetched_at);
          }
        } catch {
          // silently ignore auto-fetch failure
        } finally {
          setLiveFetching(false);
        }
      }
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
    return { totalCost, currentValue: lastValue, pl, plPct, assetType, txCount: txs.length, lastDate };
  }, [txs]);

  const totalUnits = useMemo(() => {
    let latest: { units: number | null; date: string } = { units: null, date: "" };
    txs.forEach((t) => {
      if (t.units != null && t.date >= latest.date) {
        latest = { units: t.units, date: t.date };
      }
    });
    return latest.units;
  }, [txs]);

  const lastSnapshot = useMemo(() => txs.length > 0 ? txs[txs.length - 1] : null, [txs]);

  async function fetchLivePrice() {
    if (!lastSnapshot || !isLive(symbol)) return;
    setLiveFetching(true);
    setLiveError("");
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{
            symbol,
            snapshotDate: lastSnapshot.date,
            snapshotValue: Number(lastSnapshot.total_value),
            ...(totalUnits != null ? { units: totalUnits } : {}),
          }],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const p = json.prices?.[0];
      if (p?.liveValue != null) setLiveValue(p.liveValue);
      if (p?.currentPrice != null) setCurrentPrice(p.currentPrice);
      if (p?.error) setLiveError(p.error);
      setLiveFetchedAt(json.fetched_at);
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : "ไม่สามารถดึงราคาได้");
    } finally {
      setLiveFetching(false);
    }
  }

  const displayValue = liveValue ?? summary.currentValue;
  const displayPL = displayValue - summary.totalCost;
  const displayPLPct = summary.totalCost > 0 ? (displayPL / summary.totalCost) * 100 : 0;

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
        units: t.units,
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

  function openEdit(r: HistoryRow) {
    const tx = txs.find((t) => t.id === r.id);
    if (!tx) return;
    setEditTx(tx);
    setEditForm({
      tx_type: tx.tx_type,
      amount: String(tx.amount),
      total_value: String(tx.total_value),
      date: tx.date,
      units: tx.units != null ? String(tx.units) : "",
    });
    setEditError("");
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTx) return;
    if (editForm.amount === "" || parseFloat(editForm.amount) < 0) { setEditError("กรุณากรอกจำนวนเงิน (≥ 0)"); return; }
    if (!editForm.total_value || parseFloat(editForm.total_value) < 0) { setEditError("กรุณากรอกมูลค่ารวม (≥ 0)"); return; }
    if (!editForm.date) { setEditError("กรุณาเลือกวันที่"); return; }
    setEditing(true);
    setEditError("");
    const unitsVal = editForm.units !== "" ? parseFloat(editForm.units) : null;
    const { error } = await supabase
      .from("transactions")
      .update({
        tx_type: editForm.tx_type,
        amount: parseFloat(editForm.amount),
        total_value: parseFloat(editForm.total_value),
        date: editForm.date,
        units: unitsVal,
      })
      .eq("id", editTx.id);
    if (error) {
      setEditError("แก้ไขไม่สำเร็จ: " + error.message);
      setEditing(false);
      return;
    }
    setTxs((prev) =>
      prev
        .map((t) =>
          t.id === editTx.id
            ? { ...t, tx_type: editForm.tx_type, amount: parseFloat(editForm.amount), total_value: parseFloat(editForm.total_value), date: editForm.date, units: unitsVal }
            : t
        )
        .sort((a, b) => a.date.localeCompare(b.date))
    );
    setEditTx(null);
    setEditing(false);
  }

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

  const filteredHistory = useMemo(() => {
    if (chartRange === "all") return historyRows;
    const days = { "1m": 30, "3m": 90, "6m": 180, "1y": 365 }[chartRange];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return historyRows.filter((r) => r.x >= cutoff);
  }, [historyRows, chartRange]);

  const filteredMarkers = useMemo(
    () => chartMarkers.filter((m) => {
      if (chartRange === "all") return true;
      const days = { "1m": 30, "3m": 90, "6m": 180, "1y": 365 }[chartRange];
      return m.x >= Date.now() - days * 24 * 60 * 60 * 1000;
    }),
    [chartMarkers, chartRange]
  );

  const sortedHistory = useMemo(() => [...historyRows].reverse(), [historyRows]);
  const pagedHistory = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedHistory.slice(start, start + pageSize);
  }, [sortedHistory, page, pageSize]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">กำลังโหลดข้อมูล...</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-gray-950 p-6">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-400 hover:text-gray-100 mb-6"
          >
            ← กลับหน้า Dashboard
          </button>
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-10 text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-sm font-medium text-gray-300">ไม่พบข้อมูลสินทรัพย์ {symbol}</p>
          </div>
        </div>
      </main>
    );
  }

  const unitsLabel = UNITS_LABEL[summary.assetType] || "หน่วย";

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/")}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 transition"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-sm font-semibold text-gray-300">
              {symbol.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-100">{symbol}</h1>
                {liveValue != null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/50 text-green-300 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    LIVE
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[summary.assetType] || "bg-gray-800 text-gray-300"}`}>
                  {TYPE_LABEL[summary.assetType] || summary.assetType}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{summary.txCount} รายการ</p>
            </div>
          </div>
        </div>

        {/* Live price bar */}
        {isLive(symbol) && (
          <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 mb-4 gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              {liveFetching ? (
                <span className="text-xs text-gray-500">กำลังดึงราคา...</span>
              ) : liveValue != null ? (
                <>
                  <span className="text-xs text-green-300 font-medium">ราคาปัจจุบัน</span>
                  {currentPrice != null && (
                    <span className="text-xs text-gray-300 font-medium">
                      ฿{fmt(currentPrice)}<span className="text-gray-500">/{unitsLabel}</span>
                    </span>
                  )}
                  {totalUnits != null && (
                    <span className="text-xs text-gray-500">
                      · ถือครอง {fmtUnits(totalUnits)} {unitsLabel}
                    </span>
                  )}
                </>
              ) : liveError ? (
                <span className="text-xs text-amber-400">{liveError}</span>
              ) : (
                <span className="text-xs text-gray-500">กดดึงราคาเพื่ออัปเดต</span>
              )}
              {liveFetchedAt && !liveFetching && (
                <span className="text-xs text-gray-600">
                  · {new Date(liveFetchedAt).toLocaleTimeString("th-TH")}
                </span>
              )}
            </div>
            <button
              onClick={fetchLivePrice}
              disabled={liveFetching}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-gray-700 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-50 transition shrink-0"
            >
              <svg className={`w-3 h-3 ${liveFetching ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              ดึงราคา
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "ต้นทุนรวม", value: `฿${fmt(summary.totalCost)}`, color: "text-gray-50" },
            { label: liveValue != null ? "มูลค่า (LIVE)" : "มูลค่าปัจจุบัน", value: `฿${fmt(displayValue)}`, color: "text-gray-50" },
            { label: "กำไร / ขาดทุน",
              value: `${displayPL >= 0 ? "+" : ""}฿${fmt(displayPL)}`,
              color: displayPL >= 0 ? "text-green-400" : "text-red-400" },
            { label: "ผลตอบแทน",
              value: `${displayPLPct >= 0 ? "+" : ""}${displayPLPct.toFixed(2)}%`,
              color: displayPLPct >= 0 ? "text-green-400" : "text-red-400" },
          ].map((m) => (
            <div key={m.label} className="bg-gray-900 rounded-xl border border-gray-700 p-4">
              <p className="text-xs text-gray-400 mb-1">{m.label}</p>
              <p className={`text-lg font-semibold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-gray-300">มูลค่าและต้นทุนตามเวลา</h2>
              <p className="text-xs text-gray-500 mt-0.5">เส้นน้ำเงิน = มูลค่าตลาด · เส้นเทาประ = ต้นทุนสะสม</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />ซื้อ</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />ขาย</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-400" />Snapshot</span>
            </div>
          </div>
          <div className="flex items-center gap-1 mb-3">
            {(["1m", "3m", "6m", "1y", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                  chartRange === r
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                }`}
              >
                {r === "all" ? "ทั้งหมด" : r.toUpperCase()}
              </button>
            ))}
          </div>
          {filteredHistory.length >= 2 ? (
            <ValueChart rows={filteredHistory} markers={filteredMarkers} />
          ) : filteredHistory.length === 0 && historyRows.length >= 2 ? (
            <div className="text-center py-12 text-sm text-gray-500">
              ไม่มีข้อมูลในช่วงเวลานี้
            </div>
          ) : (
            <div className="text-center py-12 text-sm text-gray-500">
              ต้องมีรายการอย่างน้อย 2 ครั้งเพื่อแสดงกราฟ
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-300">ประวัติการบันทึก</h2>
            <p className="text-xs text-gray-500 mt-0.5">{txs.length} รายการ</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-xs text-gray-400">
                  <th className="text-left px-5 py-3 font-medium">วันที่</th>
                  <th className="text-left px-5 py-3 font-medium">รายการ</th>
                  <th className="text-right px-4 py-3 font-medium">หน่วยคงเหลือ</th>
                  <th className="text-right px-5 py-3 font-medium">จำนวนเข้าซื้อ</th>
                  <th className="text-right px-5 py-3 font-medium">ต้นทุนสะสม</th>
                  <th className="text-right px-5 py-3 font-medium">มูลค่ารวม</th>
                  <th className="text-right px-5 py-3 font-medium">กำไร / ขาดทุน</th>
                  <th className="px-3 py-3 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {pagedHistory.map((r, i) => {
                  const isSell = r.txType === "sell";
                  const isSnapshot = r.amount === 0;
                  const pl = r.totalValue - r.cumulativeCost;
                  const plPct = r.cumulativeCost > 0 ? (pl / r.cumulativeCost) * 100 : 0;
                  return (
                    <tr key={i} className="hover:bg-gray-800 transition-colors">
                      <td className="px-5 py-4 text-gray-300">{fmtDate(r.date)}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isSnapshot
                            ? "bg-gray-800 text-gray-300"
                            : isSell ? "bg-red-900/50 text-red-300" : "bg-green-900/50 text-green-300"
                        }`}>
                          {isSnapshot ? "Snapshot" : isSell ? "ขาย" : "ซื้อ"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-xs text-gray-500">
                        {r.units != null ? fmtUnits(r.units) : "—"}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-400">
                        {r.amount === 0 ? "—" : `${isSell ? "-" : "+"}฿${fmt(r.amount)}`}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-400">฿{fmt(r.cumulativeCost)}</td>
                      <td className="px-5 py-4 text-right font-medium text-gray-100">฿{fmt(r.totalValue)}</td>
                      <td className="px-5 py-4 text-right">
                        <p className={`font-medium ${pl >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {pl >= 0 ? "+" : ""}฿{fmt(pl)}
                        </p>
                        <p className={`text-xs mt-0.5 ${plPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%
                        </p>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(r)}
                            aria-label="แก้ไขรายการนี้"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 transition"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => { setDeleteError(""); setConfirmDelete(r); }}
                            aria-label="ลบรายการนี้"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                            </svg>
                          </button>
                        </div>
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

      {editTx && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => !editing && setEditTx(null)}
        >
          <div
            className="bg-gray-900 rounded-2xl shadow-xl border border-gray-700 max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-100 mb-4">แก้ไขรายการ</h3>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">รายการ</label>
                <select
                  value={editForm.tx_type}
                  onChange={(e) => setEditForm({ ...editForm, tx_type: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm text-gray-100 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="buy">ซื้อ / DCA</option>
                  <option value="sell">ขาย</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">จำนวนเงิน (บาท)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">฿</span>
                  <input
                    type="number"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    placeholder="0.00"
                    min="0"
                    step="any"
                    className="w-full pl-7 pr-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">มูลค่ารวม ณ วันที่ (บาท)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">฿</span>
                  <input
                    type="number"
                    value={editForm.total_value}
                    onChange={(e) => setEditForm({ ...editForm, total_value: e.target.value })}
                    placeholder="0.00"
                    min="0"
                    step="any"
                    className="w-full pl-7 pr-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {isLive(symbol) && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    {unitsLabel}คงเหลือ <span className="text-gray-600">(ไม่บังคับ)</span>
                  </label>
                  <input
                    type="number"
                    value={editForm.units}
                    onChange={(e) => setEditForm({ ...editForm, units: e.target.value })}
                    placeholder="0.0000"
                    min="0"
                    step="any"
                    className="w-full px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">วันที่</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm text-gray-100 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {editError && (
                <p className="text-xs text-red-400 bg-red-950 border border-red-900 rounded-lg px-3 py-2">{editError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditTx(null)}
                  disabled={editing}
                  className="flex-1 px-4 py-2.5 text-sm text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={editing}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition"
                >
                  {editing ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="bg-gray-900 rounded-2xl shadow-xl border border-gray-700 max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-100">ลบรายการนี้?</h3>
                <p className="text-sm text-gray-400 mt-1">การลบจะไม่สามารถย้อนกลับได้</p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-300 mb-4 space-y-1">
              <div className="flex justify-between"><span className="text-gray-400">วันที่</span><span>{fmtDate(confirmDelete.date)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">รายการ</span><span>{confirmDelete.amount === 0 ? "Snapshot" : confirmDelete.txType === "sell" ? "ขาย" : "ซื้อ"}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">จำนวน</span><span>{confirmDelete.amount === 0 ? "—" : `฿${fmt(confirmDelete.amount)}`}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">มูลค่ารวม</span><span>฿{fmt(confirmDelete.totalValue)}</span></div>
            </div>

            {deleteError && (
              <p className="text-xs text-red-400 bg-red-950 border border-red-900 rounded-lg px-3 py-2 mb-3">
                {deleteError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
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
