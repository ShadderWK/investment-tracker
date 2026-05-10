import { NextResponse } from "next/server";
import { authenticateAdmin } from "../_lib";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  const action = url.searchParams.get("action");
  const limit = Math.min(500, Number(url.searchParams.get("limit") || 200));

  let q = supabaseAdmin
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (userId) q = q.eq("user_id", userId);
  if (action) q = q.eq("action", action);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data || [] });
}
