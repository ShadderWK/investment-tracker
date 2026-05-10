import { NextResponse } from "next/server";
import { authenticateAdmin } from "../_lib";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("asset_symbols")
    .select("*")
    .order("symbol");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assets: data });
}

export async function POST(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await req.json();
  const { symbol, name, asset_type } = body;
  if (!symbol?.trim()) return NextResponse.json({ error: "กรุณากรอก symbol" }, { status: 400 });
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("asset_symbols")
    .insert({ symbol: symbol.trim().toUpperCase(), name: name?.trim() || null, asset_type: asset_type || "fund" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asset: data });
}
