"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";

type AssetSymbol = {
  id: string;
  symbol: string;
  name: string | null;
  asset_type: string;
  created_at: string;
};

type TxSymbol = {
  symbol: string;
  count: number;
  asset_type: string;
};

const TYPE_LABEL: Record<string, string> = {
  stock: "หุ้น",
  crypto: "คริปโต",
  gold: "ทองคำ",
  etf: "ETF",
  fund: "กองทุนรวม",
};

const TYPE_COLOR: Record<string, string> = {
  stock: "bg-blue-900/50 text-blue-300",
  crypto: "bg-purple-900/50 text-purple-300",
  gold: "bg-amber-900/50 text-amber-300",
  etf: "bg-green-900/50 text-green-300",
  fund: "bg-indigo-900/50 text-indigo-300",
};

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<AssetSymbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<AssetSymbol | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({ symbol: "", name: "", asset_type: "fund" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  // remap state
  const [txSymbols, setTxSymbols] = useState<TxSymbol[]>([]);
  const [remapTargets, setRemapTargets] = useState<Record<string, string>>({});
  const [remapping, setRemapping] = useState<Record<string, boolean>>({});
  const [remapResult, setRemapResult] = useState<Record<string, string>>({});
  const [remapLoading, setRemapLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch("/api/admin/assets");
      setAssets(data.assets || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadRemap() {
    setRemapLoading(true);
    try {
      const data = await adminFetch("/api/admin/assets/remap");
      setTxSymbols(data.tx_symbols || []);
    } catch {
      // non-critical
    } finally {
      setRemapLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadRemap();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) => a.symbol.toLowerCase().includes(q) || (a.name || "").toLowerCase().includes(q)
    );
  }, [assets, search]);

  const assetSymbolSet = useMemo(() => new Set(assets.map((a) => a.symbol)), [assets]);

  const unmatchedTx = useMemo(
    () => txSymbols.filter((t) => !assetSymbolSet.has(t.symbol)),
    [txSymbols, assetSymbolSet]
  );
  const matchedTx = useMemo(
    () => txSymbols.filter((t) => assetSymbolSet.has(t.symbol)),
    [txSymbols, assetSymbolSet]
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!form.symbol.trim()) { setAddError("กรุณากรอก Symbol"); return; }
    setAdding(true);
    try {
      await adminFetch("/api/admin/assets", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ symbol: "", name: "", asset_type: "fund" });
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await adminFetch(`/api/admin/assets/${confirmDelete.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  async function handleRemap(fromSymbol: string) {
    const toSymbol = remapTargets[fromSymbol];
    if (!toSymbol) return;
    setRemapping((r) => ({ ...r, [fromSymbol]: true }));
    setRemapResult((r) => ({ ...r, [fromSymbol]: "" }));
    try {
      const res = await adminFetch("/api/admin/assets/remap", {
        method: "POST",
        body: JSON.stringify({ from_symbol: fromSymbol, to_symbol: toSymbol }),
      });
      setRemapResult((r) => ({ ...r, [fromSymbol]: `✓ เชื่อมโยงสำเร็จ (${res.updated ?? "?"} รายการ)` }));
      await loadRemap();
    } catch (e) {
      setRemapResult((r) => ({
        ...r,
        [fromSymbol]: `✗ ${e instanceof Error ? e.message : String(e)}`,
      }));
    } finally {
      setRemapping((r) => ({ ...r, [fromSymbol]: false }));
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Asset Symbols</h1>
          <p className="text-sm text-gray-400">{assets.length} สินทรัพย์ · รายการที่ user เลือกได้ตอนบันทึก</p>
        </div>
        <input
          type="search"
          placeholder="ค้นหา..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-700 rounded-lg bg-gray-800 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
      </div>

      {/* Add form */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-5">
        <h2 className="text-sm font-medium text-gray-300 mb-3">เพิ่ม Symbol ใหม่</h2>
        <form onSubmit={handleAdd} className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Symbol *</label>
            <input
              type="text"
              placeholder="เช่น KFIRMF, BTC"
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-600 rounded-lg bg-gray-800 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase w-44"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">ชื่อเต็ม (ไม่บังคับ)</label>
            <input
              type="text"
              placeholder="เช่น กองทุนรวม KFIRMF"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-600 rounded-lg bg-gray-800 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">ประเภท</label>
            <select
              value={form.asset_type}
              onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-600 rounded-lg bg-gray-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="fund">กองทุนรวม</option>
              <option value="etf">ETF</option>
              <option value="stock">หุ้น</option>
              <option value="crypto">คริปโต</option>
              <option value="gold">ทองคำ</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition"
          >
            {adding ? "กำลังเพิ่ม..." : "+ เพิ่ม"}
          </button>
        </form>
        {addError && (
          <p className="text-xs text-red-400 bg-red-950 border border-red-900 rounded-lg px-3 py-2 mt-3">{addError}</p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950 border border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Asset symbols table */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-500">กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-500">
            {assets.length === 0 ? "ยังไม่มี symbol ลองเพิ่มด้านบน" : "ไม่พบ symbol ที่ค้นหา"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-xs text-gray-400">
                <th className="text-left px-5 py-3 font-medium">Symbol</th>
                <th className="text-left px-5 py-3 font-medium">ชื่อเต็ม</th>
                <th className="text-left px-5 py-3 font-medium">ประเภท</th>
                <th className="text-left px-5 py-3 font-medium">เพิ่มเมื่อ</th>
                <th className="px-3 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-800 transition-colors">
                  <td className="px-5 py-3 font-semibold text-gray-100">{a.symbol}</td>
                  <td className="px-5 py-3 text-gray-400">{a.name || "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[a.asset_type] || "bg-gray-800 text-gray-300"}`}>
                      {TYPE_LABEL[a.asset_type] || a.asset_type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{fmtDateTime(a.created_at)}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => setConfirmDelete(a)}
                      className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-400 hover:bg-red-900/20"
                      aria-label="ลบ"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Transaction symbol mapping */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-medium text-gray-300">เชื่อมโยง Transaction เก่า</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Symbols จาก transactions ที่ยังไม่ตรงกับรายการ · เลือก symbol ปลายทางแล้วกด เชื่อมโยง
          </p>
        </div>

        {remapLoading ? (
          <div className="text-center py-10 text-sm text-gray-500">กำลังโหลด...</div>
        ) : txSymbols.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500">ยังไม่มี transaction ในระบบ</div>
        ) : (
          <div className="divide-y divide-gray-800">

            {unmatchedTx.length > 0 && (
              <div>
                <div className="px-5 py-2 bg-amber-950/30">
                  <p className="text-xs font-medium text-amber-400">ไม่ตรงกับรายการ ({unmatchedTx.length})</p>
                </div>
                {unmatchedTx.map((t) => (
                  <div key={t.symbol} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                    <div className="min-w-[140px]">
                      <p className="font-semibold text-sm text-gray-100">{t.symbol}</p>
                      <p className="text-xs text-gray-500">{t.count} transactions · {TYPE_LABEL[t.asset_type] || t.asset_type}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <select
                      value={remapTargets[t.symbol] || ""}
                      onChange={(e) => setRemapTargets((r) => ({ ...r, [t.symbol]: e.target.value }))}
                      className="px-3 py-1.5 text-sm border border-gray-600 rounded-lg bg-gray-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[180px]"
                    >
                      <option value="">— เลือก symbol ปลายทาง —</option>
                      {assets.map((a) => (
                        <option key={a.symbol} value={a.symbol}>
                          {a.symbol}{a.name ? ` — ${a.name}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRemap(t.symbol)}
                      disabled={!remapTargets[t.symbol] || remapping[t.symbol]}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition shrink-0"
                    >
                      {remapping[t.symbol] ? "กำลังเชื่อม..." : "เชื่อมโยง"}
                    </button>
                    {remapResult[t.symbol] && (
                      <p className={`text-xs w-full mt-0.5 ${remapResult[t.symbol].startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
                        {remapResult[t.symbol]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {matchedTx.length > 0 && (
              <div>
                <div className="px-5 py-2 bg-green-950/20">
                  <p className="text-xs font-medium text-green-400">ตรงกับรายการแล้ว ({matchedTx.length})</p>
                </div>
                {matchedTx.map((t) => (
                  <div key={t.symbol} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                    <div className="min-w-[140px]">
                      <p className="font-semibold text-sm text-gray-100">{t.symbol}</p>
                      <p className="text-xs text-gray-500">{t.count} transactions · {TYPE_LABEL[t.asset_type] || t.asset_type}</p>
                    </div>
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      ตรงกันแล้ว
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <select
                        value={remapTargets[t.symbol] || ""}
                        onChange={(e) => setRemapTargets((r) => ({ ...r, [t.symbol]: e.target.value }))}
                        className="px-3 py-1.5 text-sm border border-gray-700 rounded-lg bg-gray-800 text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">ย้ายไป symbol อื่น...</option>
                        {assets.filter((a) => a.symbol !== t.symbol).map((a) => (
                          <option key={a.symbol} value={a.symbol}>
                            {a.symbol}{a.name ? ` — ${a.name}` : ""}
                          </option>
                        ))}
                      </select>
                      {remapTargets[t.symbol] && (
                        <button
                          onClick={() => handleRemap(t.symbol)}
                          disabled={remapping[t.symbol]}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition shrink-0"
                        >
                          {remapping[t.symbol] ? "กำลังย้าย..." : "ย้าย"}
                        </button>
                      )}
                    </div>
                    {remapResult[t.symbol] && (
                      <p className={`text-xs w-full mt-0.5 ${remapResult[t.symbol].startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
                        {remapResult[t.symbol]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Delete modal */}
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
                <h3 className="text-base font-semibold text-gray-100">ลบ {confirmDelete.symbol}?</h3>
                <p className="text-sm text-gray-400 mt-1">
                  จะไม่กระทบ transaction ที่บันทึกไปแล้ว แต่ user จะเลือก symbol นี้ไม่ได้อีก
                </p>
              </div>
            </div>
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
                {deleting ? "กำลังลบ..." : "ลบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
