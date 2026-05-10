"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/log";

export default function AddPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    symbol: "",
    asset_type: "fund",
    tx_type: "buy",
    amount: "",
    total_value: "",
    date: new Date().toISOString().split("T")[0],
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.symbol.trim()) { setError("กรุณากรอกชื่อสินทรัพย์"); return; }
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
      symbol: form.symbol.trim().toUpperCase(),
      asset_type: form.asset_type,
      tx_type: form.tx_type,
      amount: parseFloat(form.amount),
      total_value: parseFloat(form.total_value),
      date: form.date,
    });

    setLoading(false);

    if (insertError) {
      setError("เกิดข้อผิดพลาด: " + insertError.message);
    } else {
      await logActivity("tx_add", {
        symbol: form.symbol.trim().toUpperCase(),
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
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-gray-900">บันทึกสำเร็จ!</p>
          <p className="text-sm text-gray-500 mt-1">กำลังกลับไปหน้าหลัก...</p>
        </div>
      </main>
    );
  }

  const profit =
    form.amount && form.total_value
      ? parseFloat(form.total_value) - parseFloat(form.amount || "0")
      : null;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-lg mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">เพิ่มการลงทุน</h1>
            <p className="text-sm text-gray-500">บันทึกรายการลงทุน (DCA)</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">ประเภท</label>
                <select
                  name="asset_type"
                  value={form.asset_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm text-gray-900 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                >
                  <option value="fund">กองทุนรวม</option>
                  <option value="etf">ETF</option>
                  <option value="stock">หุ้น</option>
                  <option value="crypto">คริปโต</option>
                  <option value="gold">ทองคำ</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">รายการ</label>
                <select
                  name="tx_type"
                  value={form.tx_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm text-gray-900 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                >
                  <option value="buy">ซื้อ / DCA</option>
                  <option value="sell">ขาย</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                ชื่อสินทรัพย์ / Ticker
              </label>
              <input
                type="text"
                name="symbol"
                value={form.symbol}
                onChange={handleChange}
                placeholder="เช่น KUS500XA, KFIRMF"
                className="w-full px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                จำนวนเงินที่ใส่/ขายครั้งนี้ (บาท)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">฿</span>
                <input
                  type="number"
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0"
                  step="any"
                  className="w-full pl-7 pr-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                มูลค่ารวมของพอร์ตนี้ ณ วันที่ (บาท)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">฿</span>
                <input
                  type="number"
                  name="total_value"
                  value={form.total_value}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0"
                  step="any"
                  className="w-full pl-7 pr-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">มูลค่าตลาดรวมของสินทรัพย์นี้หลังรายการนี้</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">วันที่</label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="w-full px-3 py-2.5 text-sm text-gray-900 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            {profit !== null && (
              <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm">
                <p className="text-blue-700 font-medium">
                  มูลค่ารวม: ฿{parseFloat(form.total_value || "0").toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
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
        </div>

      </div>
    </main>
  );
}
