import { NextResponse } from "next/server";
import { authenticateAdmin } from "../../_lib";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("asset_symbols").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
