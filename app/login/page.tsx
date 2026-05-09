"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // --- mock login (ทดสอบก่อน เดี๋ยวเชื่อม Supabase ทีหลัง) ---
    await new Promise((r) => setTimeout(r, 800));

    if (!email || !password) {
      setError("กรุณากรอกอีเมลและรหัสผ่าน");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      setLoading(false);
      return;
    }

    // mock สำเร็จ → ไปหน้า dashboard
    router.push("/");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Portfolio Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isRegister ? "สร้างบัญชีใหม่" : "เข้าสู่ระบบเพื่อดูพอร์ตของคุณ"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Name (เฉพาะหน้า register) */}
            {isRegister && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  ชื่อของคุณ
                </label>
                <input
                  type="text"
                  placeholder="กรอกชื่อ"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                อีเมล
              </label>
              <input
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                รหัสผ่าน
              </label>
              <input
                type="password"
                placeholder="อย่างน้อย 6 ตัวอักษร"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* Error message */}
            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              {loading ? "กำลังโหลด..." : isRegister ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
            </button>

          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">หรือ</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Toggle login/register */}
          <button
            onClick={() => { setIsRegister(!isRegister); setError(""); }}
            className="w-full text-sm text-gray-600 hover:text-blue-600 transition text-center"
          >
            {isRegister
              ? "มีบัญชีแล้ว? เข้าสู่ระบบ"
              : "ยังไม่มีบัญชี? สมัครสมาชิก"}
          </button>

        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          ข้อมูลของคุณปลอดภัยและเข้ารหัสเสมอ
        </p>

      </div>
    </main>
  );
}