"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      if (!isAdmin(session.user.email)) {
        setAuthorized(false);
        return;
      }
      setEmail(session.user.email || "");
      setAuthorized(true);
    })();
  }, [router]);

  if (authorized === null) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">กำลังตรวจสอบสิทธิ์...</p>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-base font-semibold text-gray-900">ไม่มีสิทธิ์เข้าถึง</p>
          <p className="text-sm text-gray-500 mt-1">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
          <Link href="/" className="inline-block mt-4 text-sm text-blue-600 hover:underline">← กลับ Dashboard</Link>
        </div>
      </main>
    );
  }

  const tabs = [
    { href: "/admin/users", label: "Users" },
    { href: "/admin/logs", label: "Activity Logs" },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center text-xs font-bold">A</span>
              <span className="font-semibold text-gray-900">Admin</span>
            </Link>
            <nav className="flex items-center gap-1">
              {tabs.map((t) => {
                const active = pathname === t.href || pathname.startsWith(t.href + "/");
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`px-3 py-1.5 text-sm rounded-md transition ${
                      active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">{email}</span>
            <Link href="/" className="px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 text-gray-700">
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">{children}</div>
    </main>
  );
}
