import { NextResponse } from "next/server";
import { authenticateAdmin } from "../../_lib";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;

  const { data: tx } = await supabaseAdmin
    .from("transactions").select("id, portfolio_id, symbol, amount").eq("id", id).single();

  const { error } = await supabaseAdmin.from("transactions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("activity_logs").insert({
    user_id: auth.userId,
    user_email: auth.email,
    action: "admin_tx_delete",
    details: { target_tx_id: id, symbol: tx?.symbol, amount: tx?.amount },
  });

  return NextResponse.json({ ok: true });
}
