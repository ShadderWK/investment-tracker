import { NextResponse } from "next/server";
import { authenticateAdmin } from "../../_lib";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const admin = getSupabaseAdmin();

  const { data: txRows, error: txErr } = await admin
    .from("transactions")
    .select("symbol, asset_type");
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  const countMap: Record<string, { count: number; asset_type: string }> = {};
  for (const row of txRows || []) {
    if (!countMap[row.symbol]) countMap[row.symbol] = { count: 0, asset_type: row.asset_type };
    countMap[row.symbol].count++;
  }
  const tx_symbols = Object.entries(countMap)
    .map(([symbol, { count, asset_type }]) => ({ symbol, count, asset_type }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const { data: assetRows, error: assetErr } = await admin
    .from("asset_symbols")
    .select("symbol, name, asset_type")
    .order("symbol");
  if (assetErr) return NextResponse.json({ error: assetErr.message }, { status: 500 });

  return NextResponse.json({ tx_symbols, asset_symbols: assetRows || [] });
}

export async function POST(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { from_symbol, to_symbol } = await req.json();
  if (!from_symbol || !to_symbol) {
    return NextResponse.json({ error: "from_symbol and to_symbol required" }, { status: 400 });
  }
  const admin = getSupabaseAdmin();

  const { data: target, error: findErr } = await admin
    .from("asset_symbols")
    .select("asset_type")
    .eq("symbol", to_symbol)
    .single();
  if (findErr || !target) {
    return NextResponse.json({ error: `ไม่พบ symbol "${to_symbol}" ในรายการ` }, { status: 404 });
  }

  const { error: updateErr, count } = await admin
    .from("transactions")
    .update({ symbol: to_symbol, asset_type: target.asset_type })
    .eq("symbol", from_symbol);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, updated: count });
}
