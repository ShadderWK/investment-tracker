"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AddPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    symbol: "",
    asset_type: "stock",
    qty: "",
    price: "",
    current_price: "",
    date: new Date().toISOString().split("T")[0],
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Validate
    if (!form.symbol.trim()) { setError("กรุณากรอกชื่อสินทรัพย์"); return; }
    if (!form.qty || parseFloat(form.qty) <= 0) { setError("กรุณากรอกจำนวนที่ถูกต้อง"); return; }
    if (!form.price || parseFloat(form.price) <= 0) { setError("กรุณากรอกราคาที่ซื้อ"); return; }
    if (!form.current_price || parseFloat(form.current_price) <= 0) { setError("กรุณากรอกราคาปัจจุบัน"); return; }
    if (!form.date) { setError("กรุณาเลือกวันที่ซื้อ"); return; }

    setLoading(true);

    // เช็ค session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    // ดึง portfolio_id
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

    // บันทึก transaction
    const { error: insertError } = await supabase.from("transactions").insert({
      portfolio_id: portfolioId,
      symbol: form.symbol.trim().toUpperCase(),
      asset_type: form.asset_type,
      tx_type: "buy",
      price: parseFloat(form.price),
      qty: parseFloat(form.qty),
      current_price: parseFloat(form.current_price),
      date: form.date,
    });

    setLoading(false);

    if (insertError) {
      setError("เกิดข้อผิดพลาด: " + insertError.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/"), 1500);
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

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-lg mx-auto">

        {/* Header */}
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
            <p className="text-sm text-gray-500">บันทึกรายการซื้อสินทรัพย์</p>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ประเภทสินทรัพย์ */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                ประเภทสินทรัพย์
              </label>
              <select
                name="asset_type"
                value={form.asset_type}
                onChange={handleChange}
                className="w-full px-3 py-2.5 text-sm text-gray-900 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              >
                <option value="stock">หุ้น (Stock)</option>
                <option value="crypto">คริปโต (Crypto)</option>
                <option value="gold">ทองคำ</option>
                <option value="etf">ETF / กองทุน</option>
              </select>
            </div>

            {/* ชื่อสินทรัพย์ */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                ชื่อสินทรัพย์ / Ticker
              </label>
              <input
                type="text"
                name="symbol"
                value={form.symbol}
                onChange={handleChange}
                placeholder="เช่น AAPL, BTC, PTT"
                className="w-full px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition uppercase"
              />
            </div>

            {/* จำนวนที่ซื้อ */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                จำนวนที่ซื้อ (หน่วย)
              </label>
              <input
                type="number"
                name="qty"
                value={form.qty}
                onChange={handleChange}
                placeholder="เช่น 10"
                min="0"
                step="any"
                className="w-full px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            {/* ราคาที่ซื้อ */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                ราคาที่ซื้อต่อหน่วย (บาท)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">฿</span>
                <input
                  type="number"
                  name="price"
                  value={form.price}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0"
                  step="any"
                  className="w-full pl-7 pr-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>

            {/* ราคาปัจจุบัน */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                ราคาปัจจุบันต่อหน่วย (บาท)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">฿</span>
                <input
                  type="number"
                  name="current_price"
                  value={form.current_price}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0"
                  step="any"
                  className="w-full pl-7 pr-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>

            {/* วันที่ซื้อ */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                วันที่ซื้อ
              </label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="w-full px-3 py-2.5 text-sm text-gray-900 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            {/* สรุปมูลค่า */}
            {form.qty && form.price && (
              <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm">
                <p className="text-blue-600 font-medium">
                  มูลค่าที่ลงทุน: ฿{(parseFloat(form.qty || "0") * parseFloat(form.price || "0")).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Buttons */}
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
                {loading ? "กำลังบันทึก..." : "บันทึกการลงทุน"}
              </button>
            </div>

          </form>
        </div>

      </div>
    </main>
  );
}