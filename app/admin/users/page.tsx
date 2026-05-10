"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/admin-fetch";
import { Pagination } from "@/app/_components/Pagination";

type AdminUser = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  tx_count: number;
  asset_count: number;
  total_cost: number;
  current_value: number;
  pl: number;
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch("/api/admin/users");
      setUsers(data.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email?.toLowerCase().includes(q));
  }, [users, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [filtered]
  );

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await adminFetch(`/api/admin/users/${confirmDelete.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">{users.length} users · จัดการบัญชีและดูพอร์ต</p>
        </div>
        <input
          type="search"
          placeholder="ค้นหา email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">กำลังโหลด...</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-500">ไม่พบ user</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="text-left px-5 py-3 font-medium">Email</th>
                    <th className="text-left px-5 py-3 font-medium">สมัคร</th>
                    <th className="text-left px-5 py-3 font-medium">Login ล่าสุด</th>
                    <th className="text-right px-5 py-3 font-medium">สินทรัพย์</th>
                    <th className="text-right px-5 py-3 font-medium">รายการ</th>
                    <th className="text-right px-5 py-3 font-medium">มูลค่า</th>
                    <th className="text-right px-5 py-3 font-medium">P/L</th>
                    <th className="px-3 py-3 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/admin/users/${u.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                          {u.email || "(no email)"}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDateTime(u.created_at)}</td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDateTime(u.last_sign_in_at)}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{u.asset_count}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{u.tx_count}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">฿{fmt(u.current_value)}</td>
                      <td className={`px-5 py-3 text-right font-medium ${u.pl >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {u.pl >= 0 ? "+" : ""}฿{fmt(u.pl)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/users/${u.id}`}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-blue-600 border border-gray-200 rounded"
                          >
                            ดู
                          </Link>
                          <button
                            onClick={() => setConfirmDelete(u)}
                            className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                            aria-label="ลบ user"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              total={sorted.length}
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
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">ลบ user นี้?</h3>
                <p className="text-sm text-gray-500 mt-1">{confirmDelete.email}</p>
                <p className="text-xs text-red-600 mt-2">⚠️ พอร์ต, transactions, logs จะถูกลบทั้งหมด ย้อนกลับไม่ได้</p>
              </div>
            </div>

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
                {deleting ? "กำลังลบ..." : "ลบ user"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
