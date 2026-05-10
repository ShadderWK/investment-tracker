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

type Req = { items: { symbol: string; snapshotDate: string; snapshotValue: number }[] };

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
    body.items.map(async (item) => {
      const source = getAssetSource(item.symbol);
      if (source.kind !== "coingecko") {
        return {
          symbol: item.symbol,
          source: "manual",
          liveValue: null as number | null,
          ratio: null as number | null,
          error: null as string | null,
        };
      }
      try {
        const [current, historical] = await Promise.all([
          fetchCoingeckoCurrent(source.id),
          fetchCoingeckoHistorical(source.id, item.snapshotDate),
        ]);
        if (current == null || historical == null || historical === 0) {
          return {
            symbol: item.symbol,
            source: "coingecko",
            liveValue: null,
            ratio: null,
            error: "ดึงราคาไม่ได้",
          };
        }
        const ratio = current / historical;
        return {
          symbol: item.symbol,
          source: "coingecko",
          liveValue: item.snapshotValue * ratio,
          ratio,
          error: null,
        };
      } catch (e) {
        return {
          symbol: item.symbol,
          source: "coingecko",
          liveValue: null,
          ratio: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    })
  );

  return NextResponse.json({ prices: results, fetched_at: new Date().toISOString() });
}
