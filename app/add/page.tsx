"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/log";
import { isLive } from "@/lib/asset-sources";

const UNITS_LABEL: Record<string, string> = {
  fund: "หน่วยลงทุน", etf: "หน่วย", stock: "หุ้น", crypto: "เหรียญ", gold: "oz",
};

type AssetSymbol = {
  id: string;
  symbol: string;
  name: string | null;
  asset_type: string;
};

export default function AddPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [symbols, setSymbols] = useState<AssetSymbol[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);

  const [form, setForm] = useState({
    symbol: "",
    asset_type: "fund",
    tx_type: "buy",
    amount: "",
    total_value: "",
    units: "",
    date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("asset_symbols")
        .select("id, symbol, name, asset_type")
        .order("symbol");
      if (data && data.length > 0) {
        setSymbols(data as AssetSymbol[]);
        setForm((f) => ({ ...f, symbol: data[0].symbol, asset_type: data[0].asset_type }));
      }
      setSymbolsLoading(false);
    })();
  }, []);

  function handleSymbolChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sym = symbols.find((s) => s.symbol === e.target.value);
    setForm((f) => ({
      ...f,
      symbol: e.target.value,
      asset_type: sym?.asset_type || f.asset_type,
    }));
    setError("");
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.symbol) { setError("กรุณาเลือกสินทรัพย์"); return; }
    if (form.amount === "" || parseFloat(form.amount) < 0) { setError("กรุณากรอกจำนวนเงินที่ใส่ (≥ 0)"); return; }
    if (!form.total_value || parseFloat(form.total_value) < 0) { setError("กรุณากรอกมูลค่ารวมหลังรายการนี้"); return; }
    if (!form.date) { setError("กรุณาเลือกวันที่"); return; }

    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    let portfolioId = localStorage.getItem("portfolio_id");
    if (!portfolioId) {
      const { data: portfolios } = await supabase
        .from("portfolios").select("id").eq("user_id", session.user.id);
      if (portfolios && portfolios.length > 0) {
        portfolioId = portfolios[0].id;
        localStorage.setItem("portfolio_id", portfolioId!);
      } else {
        const { data: newP } = await supabase
          .from("portfolios")
          .insert({ user_id: session.user.id, name: "My Portfolio" })
          .select().single();
        portfolioId = newP?.id;
        if (portfolioId) localStorage.setItem("portfolio_id", portfolioId);
      }
    }

    const { error: insertError } = await supabase.from("transactions").insert({
      portfolio_id: portfolioId,
      symbol: form.symbol,
      asset_type: form.asset_type,
      tx_type: form.tx_type,
      amount: parseFloat(form.amount),
      total_value: parseFloat(form.total_value),
      date: form.date,
      ...(form.units !== "" ? { units: parseFloat(form.units) } : {}),
    });

    setLoading(false);

    if (insertError) {
      setError("เกิดข้อผิดพลาด: " + insertError.message);
    } else {
      await logActivity("tx_add", {
        symbol: form.symbol,
        asset_type: form.asset_type,
        tx_type: form.tx_type,
        amount: parseFloat(form.amount),
        total_value: parseFloat(form.total_value),
        date: form.date,
      });
      setSuccess(true);
      setTimeout(() => router.push("/"), 1200);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-gray-100">บันทึกสำเร็จ!</p>
          <p className="text-sm text-gray-400 mt-1">กำลังกลับไปหน้าหลัก...</p>
        </div>
      </main>
    );
  }

  const selectedSymbol = symbols.find((s) => s.symbol === form.symbol);

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-lg mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 transition"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-100">เพิ่มการลงทุน</h1>
            <p className="text-sm text-gray-400">บันทึกรายการลงทุน (DCA)</p>
          </div>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 shadow-sm">
          {symbolsLoading ? (
            <div className="text-center py-8 text-sm text-gray-500">กำลังโหลดรายการสินทรัพย์...</div>
          ) : symbols.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">ยังไม่มีสินทรัพย์ในระบบ</p>
              <p className="text-xs text-gray-500 mt-1">ให้ Admin เพิ่มสินทรัพย์ก่อนที่หน้า Admin → Assets</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">สินทรัพย์</label>
                <select
                  name="symbol"
                  value={form.symbol}
                  onChange={handleSymbolChange}
                  className="w-full px-3 py-2.5 text-sm text-gray-100 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                >
                  {symbols.map((s) => (
                    <option key={s.id} value={s.symbol}>
                      {s.symbol}{s.name ? ` — ${s.name}` : ""}
                    </option>
                  ))}
                </select>
                {selectedSymbol && (
                  <p className="text-xs text-gray-500 mt-1">
                    ประเภท: {{fund: "กองทุนรวม", etf: "ETF", stock: "หุ้น", crypto: "คริปโต", gold: "ทองคำ"}[selectedSymbol.asset_type] || selectedSymbol.asset_type}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">รายการ</label>
                <select
                  name="tx_type"
                  value={form.tx_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm text-gray-100 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                >
                  <option value="buy">ซื้อ / DCA</option>
                  <option value="sell">ขาย</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  จำนวนเงินที่ใส่/ขายครั้งนี้ (บาท)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">฿</span>
                  <input
                    type="number"
                    name="amount"
                    value={form.amount}
                    onChange={handleChange}
                    placeholder="0.00"
                    min="0"
                    step="any"
                    className="w-full pl-7 pr-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  มูลค่ารวมของพอร์ตนี้ ณ วันที่ (บาท)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">฿</span>
                  <input
                    type="number"
                    name="total_value"
                    value={form.total_value}
                    onChange={handleChange}
                    placeholder="0.00"
                    min="0"
                    step="any"
                    className="w-full pl-7 pr-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">มูลค่าตลาดรวมของสินทรัพย์นี้หลังรายการนี้</p>
              </div>

              {isLive(form.symbol) && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    {UNITS_LABEL[form.asset_type] || "หน่วย"}คงเหลือหลังรายการนี้ <span className="text-gray-600">(ไม่บังคับ)</span>
                  </label>
                  <input
                    type="number"
                    name="units"
                    value={form.units}
                    onChange={handleChange}
                    placeholder="0.0000"
                    min="0"
                    step="any"
                    className="w-full px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                  <p className="text-xs text-gray-500 mt-1">ใส่เพื่อให้ระบบคำนวณมูลค่า real-time ได้แม่นยำขึ้น</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">วันที่</label>
                <input
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm text-gray-100 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-950 border border-red-900 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="flex-1 px-4 py-2.5 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition"
                >
                  {loading ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>

            </form>
          )}
        </div>

      </div>
    </main>
  );
}
