"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Row = { date: string; amount: number; total_value: number };

const KUS500XA: Row[] = [
  { date: "2024-06-01", amount: 13287.97, total_value: 14758.11 },
  { date: "2024-07-01", amount: 1000.00, total_value: 15771.96 },
  { date: "2024-08-01", amount: 1500.00, total_value: 17099.78 },
  { date: "2024-09-01", amount: 2000.00, total_value: 19265.60 },
  { date: "2024-10-01", amount: 2000.00, total_value: 21731.86 },
  { date: "2024-11-01", amount: 2212.03, total_value: 24001.54 },
  { date: "2024-12-01", amount: 3000.00, total_value: 28419.43 },
  { date: "2025-01-01", amount: 3000.00, total_value: 30476.71 },
  { date: "2025-02-01", amount: 3000.00, total_value: 34047.36 },
  { date: "2025-03-01", amount: 3000.00, total_value: 36264.84 },
  { date: "2025-04-01", amount: 3000.00, total_value: 37915.25 },
  { date: "2025-05-01", amount: 3000.00, total_value: 40408.13 },
  { date: "2025-06-01", amount: 3000.00, total_value: 45913.11 },
  { date: "2025-07-01", amount: 3000.00, total_value: 50680.12 },
  { date: "2025-08-01", amount: 3000.00, total_value: 54376.63 },
  { date: "2025-09-01", amount: 9000.00, total_value: 63954.31 },
  { date: "2025-10-01", amount: 16000.00, total_value: 82600.24 },
  { date: "2025-11-01", amount: 18000.00, total_value: 102146.28 },
  { date: "2025-12-01", amount: 3400.00, total_value: 104708.13 },
  { date: "2026-01-01", amount: 3000.00, total_value: 109084.91 },
  { date: "2026-02-01", amount: 2400.00, total_value: 111007.28 },
  { date: "2026-03-01", amount: 4400.00, total_value: 114784.15 },
  { date: "2026-04-01", amount: 4400.00, total_value: 114364.21 },
  { date: "2026-05-01", amount: 4400.00, total_value: 130260.46 },
];

const KFIRMF: Row[] = [
  { date: "2024-07-01", amount: 500.00, total_value: 500.00 },
  { date: "2024-08-01", amount: 500.00, total_value: 1003.43 },
  { date: "2024-09-01", amount: 500.00, total_value: 1505.30 },
  { date: "2024-10-01", amount: 500.00, total_value: 2012.17 },
  { date: "2024-11-01", amount: 500.00, total_value: 2521.23 },
  { date: "2024-12-01", amount: 500.00, total_value: 3037.08 },
  { date: "2025-01-01", amount: 500.00, total_value: 3543.78 },
  { date: "2025-02-01", amount: 500.00, total_value: 4048.22 },
  { date: "2025-03-01", amount: 500.00, total_value: 4566.52 },
  { date: "2025-04-01", amount: 500.00, total_value: 5114.18 },
  { date: "2025-05-01", amount: 500.00, total_value: 5635.54 },
  { date: "2025-06-01", amount: 500.00, total_value: 6168.78 },
  { date: "2025-07-01", amount: 500.00, total_value: 6713.12 },
  { date: "2025-08-01", amount: 500.00, total_value: 7251.47 },
  { date: "2025-09-01", amount: 1000.00, total_value: 8315.91 },
];

const DATASETS: { symbol: string; asset_type: string; rows: Row[] }[] = [
  { symbol: "KUS500XA", asset_type: "fund", rows: KUS500XA },
  { symbol: "KFIRMF", asset_type: "fund", rows: KFIRMF },
];

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ImportPage() {
  const router = useRouter();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      let pid = localStorage.getItem("portfolio_id");
      if (!pid) {
        const { data: portfolios } = await supabase
          .from("portfolios").select("id").eq("user_id", session.user.id);
        pid = portfolios?.[0]?.id ?? null;
        if (pid) localStorage.setItem("portfolio_id", pid);
      }
      setPortfolioId(pid);
      if (pid) {
        const { count } = await supabase
          .from("transactions")
          .select("*", { count: "exact", head: true })
          .eq("portfolio_id", pid);
        setExistingCount(count ?? 0);
      }
    })();
  }, [router]);

  function appendLog(line: string) {
    setLog((l) => [...l, line]);
  }

  async function runImport() {
    if (!portfolioId) return;
    setBusy(true);
    setLog([]);
    setDone(false);

    try {
      appendLog("กำลังลบ transactions เก่าทั้งหมด...");
      const { error: delErr, count: delCount } = await supabase
        .from("transactions")
        .delete({ count: "exact" })
        .eq("portfolio_id", portfolioId);
      if (delErr) throw new Error("Delete failed: " + delErr.message);
      appendLog(`✓ ลบแล้ว ${delCount ?? 0} รายการ`);

      const rows = DATASETS.flatMap((ds) =>
        ds.rows.map((r) => ({
          portfolio_id: portfolioId,
          symbol: ds.symbol,
          asset_type: ds.asset_type,
          tx_type: "buy",
          amount: r.amount,
          total_value: r.total_value,
          date: r.date,
        }))
      );

      appendLog(`กำลังเพิ่ม ${rows.length} รายการ...`);
      const { error: insErr } = await supabase.from("transactions").insert(rows);
      if (insErr) throw new Error("Insert failed: " + insErr.message);

      appendLog(`✓ บันทึกสำเร็จ`);
      DATASETS.forEach((ds) => {
        const tot = ds.rows.reduce((s, r) => s + r.amount, 0);
        const last = ds.rows[ds.rows.length - 1].total_value;
        appendLog(`  ${ds.symbol}: ${ds.rows.length} รายการ · ลงทุน ฿${fmt(tot)} · มูลค่า ฿${fmt(last)}`);
      });

      setDone(true);
    } catch (e: unknown) {
      appendLog("❌ " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/")}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">นำเข้าข้อมูลจาก Excel</h1>
            <p className="text-sm text-gray-500">ล้างข้อมูลเก่า + บันทึกตามไฟล์ Portfolio Investment.xlsx</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-sm text-amber-800">
          <p className="font-medium mb-1">⚠️ คำเตือน</p>
          <p>การกดปุ่ม &quot;ล้าง + นำเข้า&quot; จะลบ transactions ทั้งหมดในพอร์ตนี้
            {existingCount !== null && <> (ปัจจุบันมี <b>{existingCount}</b> รายการ)</>} แล้วบันทึกข้อมูลตาม Excel ลงไปใหม่ — ทำใหม่ไม่ได้</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-medium text-gray-700 mb-3">สรุปข้อมูลที่จะนำเข้า</h2>
          <div className="space-y-2">
            {DATASETS.map((ds) => {
              const tot = ds.rows.reduce((s, r) => s + r.amount, 0);
              const last = ds.rows[ds.rows.length - 1].total_value;
              const pl = last - tot;
              return (
                <div key={ds.symbol} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{ds.symbol}</p>
                    <p className="text-xs text-gray-500">{ds.rows.length} รายการ · {ds.rows[0].date} → {ds.rows[ds.rows.length - 1].date}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-gray-700">ลงทุน ฿{fmt(tot)} → มูลค่า ฿{fmt(last)}</p>
                    <p className={`text-xs ${pl >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {pl >= 0 ? "+" : ""}฿{fmt(pl)} ({((pl / tot) * 100).toFixed(2)}%)
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 mb-5">
          <button
            onClick={() => router.push("/")}
            className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            ยกเลิก
          </button>
          <button
            onClick={runImport}
            disabled={busy || done || !portfolioId}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 rounded-lg transition"
          >
            {busy ? "กำลังนำเข้า..." : done ? "เสร็จแล้ว" : "ล้าง + นำเข้า"}
          </button>
        </div>

        {log.length > 0 && (
          <div className="bg-gray-900 text-gray-100 font-mono text-xs rounded-xl p-4">
            {log.map((line, i) => <div key={i} className="whitespace-pre-wrap">{line}</div>)}
            {done && (
              <button
                onClick={() => router.push("/")}
                className="mt-3 text-blue-400 hover:text-blue-300 underline"
              >
                → ดู Dashboard
              </button>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
