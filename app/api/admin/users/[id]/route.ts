import { NextResponse } from "next/server";
import { authenticateAdmin } from "../../_lib";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;
  const supabaseAdmin = getSupabaseAdmin();

  const { data: userResult, error: userErr } = await supabaseAdmin.auth.admin.getUserById(id);
  if (userErr || !userResult?.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const { data: portfolios } = await supabaseAdmin
    .from("portfolios").select("id, name").eq("user_id", id);
  const pids = (portfolios || []).map((p) => p.id);
  const { data: transactions } = await supabaseAdmin
    .from("transactions").select("*")
    .in("portfolio_id", pids.length ? pids : ["00000000-0000-0000-0000-000000000000"])
    .order("date", { ascending: true });

  return NextResponse.json({
    user: {
      id: userResult.user.id,
      email: userResult.user.email,
      created_at: userResult.user.created_at,
      last_sign_in_at: userResult.user.last_sign_in_at,
      user_metadata: userResult.user.user_metadata,
    },
    portfolios: portfolios || [],
    transactions: transactions || [],
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;

  if (id === auth.userId) {
    return NextResponse.json({ error: "ลบบัญชีตัวเองไม่ได้" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("activity_logs").insert({
    user_id: auth.userId,
    user_email: auth.email,
    action: "admin_user_delete",
    details: { target_user_id: id },
  });

  return NextResponse.json({ ok: true });
}
