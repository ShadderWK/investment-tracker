"use client";

import { supabase } from "./supabase";

export async function logActivity(
  action: string,
  details?: Record<string, unknown>
) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("activity_logs").insert({
      user_id: session.user.id,
      user_email: session.user.email,
      action,
      details: details ?? null,
    });
  } catch (e) {
    console.warn("[log] failed:", e);
  }
}
