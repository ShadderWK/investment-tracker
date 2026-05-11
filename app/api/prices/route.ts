import { NextResponse } from "next/server";
import { getAssetSource } from "@/lib/asset-sources";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: number | null; at: number }>();

async function getCached(key: string, fetcher: () => Promise<number | null>): Promise<number | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await fetcher();
  cache.set(key, { value, at: Date.now() });
  return value;
}

async function fetchCoingeckoCurrent(id: string): Promise<number | null> {
  return getCached(`cg:current:${id}`, async () => {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=thb`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data[id]?.thb ?? null;
  });
}

async function fetchCoingeckoHistorical(id: string, dateISO: string): Promise<number | null> {
  return getCached(`cg:hist:${id}:${dateISO}`, async () => {
    const [y, m, d] = dateISO.split("-");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/history?date=${d}-${m}-${y}&localization=false`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.market_data?.current_price?.thb ?? null;
  });
}

function extractNav(item: Record<string, unknown>): number | null {
  const v = item?.nav ?? item?.value ?? item?.unitprice ?? item?.nav_value;
  return typeof v === "number" ? v : null;
}

const SEC_API_KEY = process.env.SEC_API_KEY ?? "";

function secHeaders(): HeadersInit {
  return SEC_API_KEY ? { "Ocp-Apim-Subscription-Key": SEC_API_KEY } : {};
}

async function fetchSecNavRange(abbr: string, startDate: string, endDate: string): Promise<number | null> {
  return getCached(`sec:${abbr}:${startDate}:${endDate}`, async () => {
    const url = `https://api.sec.or.th/FundFactsheet/fund/unitprice/daily?proj_abbr_name=${encodeURIComponent(abbr)}&start_date=${startDate}&end_date=${endDate}`;
    const res = await fetch(url, { headers: secHeaders(), next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    const items: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.data) ? data.data : [];
    if (items.length === 0) return null;
    return extractNav(items[items.length - 1]);
  });
}

async function fetchSecCurrentNav(abbr: string): Promise<number | null> {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return fetchSecNavRange(abbr, weekAgo, today);
}

async function fetchSecHistoricalNav(abbr: string, dateISO: string): Promise<number | null> {
  // Widen ±3 days to handle weekends/holidays
  const d = new Date(dateISO);
  const start = new Date(d.getTime() - 3 * 86400000).toISOString().split("T")[0];
  const end = new Date(d.getTime() + 3 * 86400000).toISOString().split("T")[0];
  return getCached(`sec:${abbr}:hist:${dateISO}`, async () => {
    const url = `https://api.sec.or.th/FundFactsheet/fund/unitprice/daily?proj_abbr_name=${encodeURIComponent(abbr)}&start_date=${start}&end_date=${end}`;
    const res = await fetch(url, { headers: secHeaders(), next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    const items: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.data) ? data.data : [];
    if (items.length === 0) return null;
    // Pick the middle item (closest to the target date in the range)
    return extractNav(items[Math.floor(items.length / 2)]);
  });
}

type ReqItem = { symbol: string; snapshotDate: string; snapshotValue: number; units?: number };
type Req = { items: ReqItem[] };

type PriceResult = {
  symbol: string;
  source: string;
  liveValue: number | null;
  currentPrice: number | null;
  ratio: number | null;
  error: string | null;
};

export async function POST(req: Request) {
  let body: Req;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }

  const results = await Promise.all(
    body.items.map(async (item): Promise<PriceResult> => {
      const source = getAssetSource(item.symbol);

      if (source.kind === "manual") {
        return { symbol: item.symbol, source: "manual", liveValue: null, currentPrice: null, ratio: null, error: null };
      }

      try {
        if (source.kind === "coingecko") {
          const current = await fetchCoingeckoCurrent(source.id);
          if (current == null) {
            return { symbol: item.symbol, source: "coingecko", liveValue: null, currentPrice: null, ratio: null, error: "ดึงราคาไม่ได้" };
          }
          if (item.units != null) {
            return { symbol: item.symbol, source: "coingecko", liveValue: item.units * current, currentPrice: current, ratio: null, error: null };
          }
          const historical = await fetchCoingeckoHistorical(source.id, item.snapshotDate);
          if (historical == null || historical === 0) {
            return { symbol: item.symbol, source: "coingecko", liveValue: null, currentPrice: current, ratio: null, error: "ดึงราคาย้อนหลังไม่ได้" };
          }
          const ratio = current / historical;
          return { symbol: item.symbol, source: "coingecko", liveValue: item.snapshotValue * ratio, currentPrice: current, ratio, error: null };
        }

        if (source.kind === "sec_fund") {
          const currentNav = await fetchSecCurrentNav(source.abbr);
          if (currentNav == null) {
            return { symbol: item.symbol, source: "sec_fund", liveValue: null, currentPrice: null, ratio: null, error: "ดึง NAV ไม่ได้" };
          }
          if (item.units != null) {
            return { symbol: item.symbol, source: "sec_fund", liveValue: item.units * currentNav, currentPrice: currentNav, ratio: null, error: null };
          }
          const historicalNav = await fetchSecHistoricalNav(source.abbr, item.snapshotDate);
          if (historicalNav == null || historicalNav === 0) {
            return { symbol: item.symbol, source: "sec_fund", liveValue: null, currentPrice: currentNav, ratio: null, error: "ดึง NAV ย้อนหลังไม่ได้" };
          }
          const ratio = currentNav / historicalNav;
          return { symbol: item.symbol, source: "sec_fund", liveValue: item.snapshotValue * ratio, currentPrice: currentNav, ratio, error: null };
        }
      } catch (e) {
        return { symbol: item.symbol, source: source.kind, liveValue: null, currentPrice: null, ratio: null, error: e instanceof Error ? e.message : String(e) };
      }

      return { symbol: item.symbol, source: "manual", liveValue: null, currentPrice: null, ratio: null, error: null };
    })
  );

  return NextResponse.json({ prices: results, fetched_at: new Date().toISOString() });
}
