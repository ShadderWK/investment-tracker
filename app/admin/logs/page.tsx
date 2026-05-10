"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import { Pagination } from "@/app/_components/Pagination";

type Log = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_LABEL: Record<string, string> = {
  login: "เข้าสู่ระบบ",
  logout: "ออกจากระบบ",
  signup: "สมัครสมาชิก",
  tx_add: "เพิ่ม transaction",
  tx_delete: "ลบ transaction",
  admin_user_delete: "Admin ลบ user",
  admin_tx_delete: "Admin ลบ transaction",
};

const ACTION_COLOR: Record<string, string> = {
  login: "bg-green-100 text-green-700",
  logout: "bg-gray-100 text-gray-600",
  signup: "bg-blue-100 text-blue-700",
  tx_add: "bg-indigo-100 text-indigo-700",
  tx_delete: "bg-red-100 text-red-600",
  admin_user_delete: "bg-red-200 text-red-800",
  admin_tx_delete: "bg-red-100 text-red-700",
};

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "medium" });
}

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch("/api/admin/logs?limit=500");
      setLogs(data.logs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs]);

  const filtered = useMemo(() => {
    const q = emailFilter.trim().toLowerCase();
    return logs.filter((l) => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (q && !(l.user_email || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, actionFilter, emailFilter]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Activity Logs</h1>
          <p className="text-sm text-gray-500">{logs.length} เหตุการณ์ล่าสุด · กรอง {filtered.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="ค้นหา email..."
            value={emailFilter}
            onChange={(e) => { setEmailFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">ทุก action</option>
            {actions.map((a) => (
              <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>
            ))}
          </select>
          <button
            onClick={load}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-700"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-500">ไม่พบ log</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="text-left px-5 py-3 font-medium whitespace-nowrap">เวลา</th>
                    <th className="text-left px-5 py-3 font-medium">User</th>
                    <th className="text-left px-5 py-3 font-medium">Action</th>
                    <th className="text-left px-5 py-3 font-medium">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                      <td className="px-5 py-3 text-gray-900">{l.user_email || "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLOR[l.action] || "bg-gray-100 text-gray-600"}`}>
                          {ACTION_LABEL[l.action] || l.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500 font-mono">
                        {l.details ? JSON.stringify(l.details) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              total={filtered.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>
    </div>
  );
}
