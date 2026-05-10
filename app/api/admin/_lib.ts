import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Missing Supabase URL or anon key");
}

const verifyClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export type AdminAuthResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; status: number; message: string };

export async function authenticateAdmin(req: Request): Promise<AdminAuthResult> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Missing bearer token" };
  }
  const token = auth.slice(7);
  const { data: { user }, error } = await verifyClient.auth.getUser(token);
  if (error || !user) {
    return { ok: false, status: 401, message: "Invalid token" };
  }
  if (!isAdmin(user.email)) {
    return { ok: false, status: 403, message: "Not an admin" };
  }
  return { ok: true, userId: user.id, email: user.email! };
}
