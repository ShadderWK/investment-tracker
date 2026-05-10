import { NextResponse } from "next/server";
import { authenticateAdmin } from "../_lib";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const supabaseAdmin = getSupabaseAdmin();

  const { data: usersList, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  const userIds = usersList.users.map((u) => u.id);

  const { data: portfolios } = await supabaseAdmin
    .from("portfolios").select("id, user_id").in("user_id", userIds);

  const portfolioByUser: Record<string, string[]> = {};
  (portfolios || []).forEach((p) => {
    if (!portfolioByUser[p.user_id]) portfolioByUser[p.user_id] = [];
    portfolioByUser[p.user_id].push(p.id);
  });
  const allPortfolioIds = (portfolios || []).map((p) => p.id);

  const { data: transactions } = await supabaseAdmin
    .from("transactions").select("portfolio_id, symbol, amount, total_value, tx_type, date")
    .in("portfolio_id", allPortfolioIds.length ? allPortfolioIds : ["00000000-0000-0000-0000-000000000000"]);

  type TxRow = { portfolio_id: string; symbol: string; amount: number; total_value: number; tx_type: string; date: string };
  const txByPortfolio: Record<string, TxRow[]> = {};
  (transactions || []).forEach((t) => {
    const tx = t as TxRow;
    if (!txByPortfolio[tx.portfolio_id]) txByPortfolio[tx.portfolio_id] = [];
    txByPortfolio[tx.portfolio_id].push(tx);
  });

  const enriched = usersList.users.map((u) => {
    const pids = portfolioByUser[u.id] || [];
    const txs = pids.flatMap((pid) => txByPortfolio[pid] || []);
    let totalCost = 0;
    const latestBySymbol: Record<string, { date: string; total_value: number }> = {};
    txs.forEach((t) => {
      const delta = t.tx_type === "sell" ? -Number(t.amount) : Number(t.amount);
      totalCost += delta;
      if (!latestBySymbol[t.symbol] || t.date > latestBySymbol[t.symbol].date) {
        latestBySymbol[t.symbol] = { date: t.date, total_value: Number(t.total_value) };
      }
    });
    const currentValue = Object.values(latestBySymbol).reduce((s, x) => s + x.total_value, 0);
    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      tx_count: txs.length,
      asset_count: Object.keys(latestBySymbol).length,
      total_cost: totalCost,
      current_value: currentValue,
      pl: currentValue - totalCost,
    };
  });

  return NextResponse.json({ users: enriched });
}
