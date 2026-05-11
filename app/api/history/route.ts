import { NextResponse } from "next/server";
import { getAssetSource } from "@/lib/asset-sources";

// ---------- SEC auth ----------
const SEC_API_KEY = process.env.SEC_API_KEY ?? "";
function secHeaders(): HeadersInit {
  return SEC_API_KEY ? { "Ocp-Apim-Subscription-Key": SEC_API_KEY } : {};
}

// ---------- 1-hour cache for range data ----------
const rangeCache = new Map<string, { data: Map<string, number>; at: number }>();
const RANGE_TTL = 60 * 60 * 1000;

async function cachedRange(
  key: string,
  fetcher: () => Promise<Map<string, number>>
): Promise<Map<string, number>> {
  const hit = rangeCache.get(key);
  if (hit && Date.now() - hit.at < RANGE_TTL) return hit.data;
  const data = await fetcher();
  rangeCache.set(key, { data, at: Date.now() });
  return data;
}

// ---------- CoinGecko market_chart/range ----------
async function cgRange(
  id: string,
  start: string,
  end: string
): Promise<Map<string, number>> {
  return cachedRange(`cg:${id}:${start}:${end}`, async () => {
    const from = Math.floor(new Date(start + "T00:00:00Z").getTime() / 1000);
    const to = Math.floor(new Date(end + "T23:59:59Z").getTime() / 1000);
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=thb&from=${from}&to=${to}`,
      { next: { revalidate: 0 } }
    );
    const m = new Map<string, number>();
    if (!res.ok) return m;
    const json = await res.json();
    // Each [timestamp_ms, price] — last price per day wins
    for (const [ts, price] of (json.prices ?? []) as [number, number][]) {
      m.set(new Date(ts).toISOString().split("T")[0], price);
    }
    return m;
  });
}

// ---------- SEC NAV range ----------
async function secRange(
  projId: string,
  start: string,
  end: string
): Promise<Map<string, number>> {
  return cachedRange(`sec:${projId}:${start}:${end}`, async () => {
    const url = `https://api.sec.or.th/v2/fund/daily-info/nav?proj_id=${encodeURIComponent(projId)}&start_nav_date=${start}&end_nav_date=${end}`;
    const res = await fetch(url, { headers: secHeaders(), next: { revalidate: 0 } });
    const m = new Map<string, number>();
    if (!res.ok) return m;
    const json = await res.json();
    for (const item of (json?.items ?? []) as Record<string, unknown>[]) {
      // SEC API uses nav_date field (YYYY-MM-DD)
      const d = (item.nav_date ?? item.date) as string | undefined;
      const v = item.last_val ?? item.nav ?? item.value ?? item.unitprice;
      if (d && typeof v === "number") m.set(d, v);
    }
    return m;
  });
}

// ---------- helpers ----------
/** Forward-fill: for missing dates, carry forward the last known price */
function forwardFill(dates: string[], m: Map<string, number>): (number | null)[] {
  let last: number | null = null;
  return dates.map((d) => {
    if (m.has(d)) last = m.get(d)!;
    return last;
  });
}

/** Generate all calendar dates from start to end inclusive */
function makeDates(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T12:00:00Z");
  const e = new Date(end + "T12:00:00Z");
  while (d <= e) {
    out.push(d.toISOString().split("T")[0]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// ---------- request types ----------
type Tx = {
  date: string;
  units: number | null;
  tx_type: string;
  amount: number;
  total_value: number;
};

type AssetInput = { symbol: string; transactions: Tx[] };
type Body = { assets: AssetInput[]; startDate: string; endDate: string };

// ---------- handler ----------
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { assets, startDate, endDate } = body;
  if (!assets?.length || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const dates = makeDates(startDate, endDate);
  const N = dates.length;
  const cost = new Float64Array(N);
  const value = new Float64Array(N);

  // ---- 1. Cumulative cost across all assets ----
  const allTxs = assets
    .flatMap((a) =>
      a.transactions.map((t) => ({ date: t.date, amount: t.amount, tx_type: t.tx_type }))
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  {
    let cum = 0;
    let ti = 0;
    for (let i = 0; i < N; i++) {
      while (ti < allTxs.length && allTxs[ti].date <= dates[i]) {
        cum += allTxs[ti].tx_type === "sell" ? -allTxs[ti].amount : allTxs[ti].amount;
        ti++;
      }
      cost[i] = cum;
    }
  }

  // ---- 2. Fetch price maps for all live assets in parallel ----
  const maps = await Promise.all(
    assets.map(async (a) => {
      const src = getAssetSource(a.symbol);
      if (src.kind === "coingecko") {
        return { sym: a.symbol, m: await cgRange(src.id, startDate, endDate) };
      }
      if (src.kind === "sec_fund") {
        return { sym: a.symbol, m: await secRange(src.projId, startDate, endDate) };
      }
      return { sym: a.symbol, m: null };
    })
  );
  const pm = new Map(maps.map((x) => [x.sym, x.m]));

  // ---- 3. Compute daily value per asset ----
  for (const asset of assets) {
    const src = getAssetSource(asset.symbol);
    const txs = [...asset.transactions].sort((a, b) => a.date.localeCompare(b.date));
    const m = pm.get(asset.symbol);
    const hasUnits = txs.some((t) => t.units != null);

    if (src.kind !== "manual" && m && m.size > 0 && hasUnits) {
      // Hybrid approach:
      //   • Before the first transaction that has units → snapshot (total_value carry-forward)
      //   • From that transaction onward → cumulative units × daily price
      // This preserves historical chart shape for old transactions that weren't recorded with units.
      const prices = forwardFill(dates, m);
      const firstUnitsDate = txs
        .filter((t) => t.units != null)
        .map((t) => t.date)
        .sort()[0] ?? "";

      let cumUnits = 0;
      let lastSnapshotV = 0;
      let ti = 0;

      for (let i = 0; i < N; i++) {
        const d = dates[i];
        while (ti < txs.length && txs[ti].date <= d) {
          const t = txs[ti++];
          if (t.units != null) cumUnits += t.tx_type === "sell" ? -t.units : t.units;
          if (t.total_value > 0) lastSnapshotV = t.total_value;
        }

        if (d < firstUnitsDate) {
          // Pre-units period: use last known total_value snapshot
          value[i] += lastSnapshotV;
        } else {
          // Units available: use cumulative units × live price
          const p = prices[i];
          if (p != null && cumUnits > 0) value[i] += cumUnits * p;
        }
      }
    } else {
      // Fallback: carry forward last known total_value (manual assets, or live without units)
      let lastV = 0;
      let ti = 0;
      for (let i = 0; i < N; i++) {
        while (ti < txs.length && txs[ti].date <= dates[i]) {
          const tv = txs[ti++].total_value;
          if (tv > 0) lastV = tv;
        }
        value[i] += lastV;
      }
    }
  }

  return NextResponse.json({
    dates,
    totalValue: Array.from(value),
    totalCost: Array.from(cost),
    fetched_at: new Date().toISOString(),
  });
}
