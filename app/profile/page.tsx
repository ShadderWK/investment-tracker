"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [initials, setInitials] = useState("");

  // Name form
  const [displayName, setDisplayName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState("");

  // Password form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const user = session.user;
      const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
      setEmail(user.email || "");
      setDisplayName(name);
      setInitials(name.slice(0, 1).toUpperCase());
      setLoading(false);
    })();
  }, [router]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError("");
    setNameSuccess(false);
    if (!displayName.trim()) { setNameError("กรุณากรอกชื่อ"); return; }
    setNameLoading(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
    setNameLoading(false);
    if (error) { setNameError("แก้ไขไม่สำเร็จ: " + error.message); return; }
    setInitials(displayName.trim().slice(0, 1).toUpperCase());
    setNameSuccess(true);
    setTimeout(() => setNameSuccess(false), 3000);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);
    if (newPassword.length < 6) { setPwError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    if (newPassword !== confirmPassword) { setPwError("รหัสผ่านไม่ตรงกัน"); return; }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);
    if (error) { setPwError("เปลี่ยนรหัสผ่านไม่สำเร็จ: " + error.message); return; }
    setNewPassword("");
    setConfirmPassword("");
    setPwSuccess(true);
    setTimeout(() => setPwSuccess(false), 3000);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">กำลังโหลด...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/")}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 transition"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-100">จัดการบัญชี</h1>
            <p className="text-sm text-gray-400">แก้ไขข้อมูลส่วนตัวและความปลอดภัย</p>
          </div>
        </div>

        {/* Avatar + email */}
        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 mb-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-100 truncate">{displayName}</p>
            <p className="text-sm text-gray-400 truncate">{email}</p>
          </div>
        </div>

        {/* Change name */}
        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">ชื่อที่แสดง</h2>
          <form onSubmit={handleSaveName} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">ชื่อ</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setNameError(""); setNameSuccess(false); }}
                placeholder="ชื่อของคุณ"
                className="w-full px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">อีเมล</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full px-3 py-2.5 text-sm text-gray-500 border border-gray-700 rounded-lg bg-gray-800/50 cursor-not-allowed"
              />
              <p className="text-xs text-gray-600 mt-1">ไม่สามารถเปลี่ยนอีเมลได้</p>
            </div>
            {nameError && (
              <p className="text-xs text-red-400 bg-red-950 border border-red-900 rounded-lg px-3 py-2">{nameError}</p>
            )}
            {nameSuccess && (
              <p className="text-xs text-green-400 bg-green-950 border border-green-900 rounded-lg px-3 py-2">✓ บันทึกชื่อเรียบร้อย</p>
            )}
            <button
              type="submit"
              disabled={nameLoading}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition"
            >
              {nameLoading ? "กำลังบันทึก..." : "บันทึกชื่อ"}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">เปลี่ยนรหัสผ่าน</h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">รหัสผ่านใหม่</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPwError(""); setPwSuccess(false); }}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  className="w-full px-3 py-2.5 pr-10 text-sm text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showNew ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">ยืนยันรหัสผ่านใหม่</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPwError(""); setPwSuccess(false); }}
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  className="w-full px-3 py-2.5 pr-10 text-sm text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showConfirm ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {pwError && (
              <p className="text-xs text-red-400 bg-red-950 border border-red-900 rounded-lg px-3 py-2">{pwError}</p>
            )}
            {pwSuccess && (
              <p className="text-xs text-green-400 bg-green-950 border border-green-900 rounded-lg px-3 py-2">✓ เปลี่ยนรหัสผ่านเรียบร้อย</p>
            )}
            <button
              type="submit"
              disabled={pwLoading}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition"
            >
              {pwLoading ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
            </button>
          </form>
        </div>

      </div>
    </main>
  );
}
