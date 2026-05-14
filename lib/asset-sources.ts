export type AssetSource =
  | { kind: "coingecko"; id: string }
  | { kind: "sec_fund"; projId: string }
  | { kind: "kasset_fund"; fundSlug: string }
  | { kind: "manual" };

export const ASSET_SOURCES: Record<string, AssetSource> = {
  // Crypto
  BTC: { kind: "coingecko", id: "bitcoin" },
  ETH: { kind: "coingecko", id: "ethereum" },
  SOL: { kind: "coingecko", id: "solana" },
  BNB: { kind: "coingecko", id: "binancecoin" },
  ADA: { kind: "coingecko", id: "cardano" },
  XRP: { kind: "coingecko", id: "ripple" },
  DOGE: { kind: "coingecko", id: "dogecoin" },
  USDT: { kind: "coingecko", id: "tether" },
  // Gold — 1 PAXG = 1 troy oz of gold, priced in THB
  GOLD: { kind: "coingecko", id: "pax-gold" },
  // Thai mutual funds via SEC Thailand Open API v2
  "K-FIRMF": { kind: "sec_fund", projId: "M0065_2544" },
  // K-US500X-A(A): scrape NAV from KAsset website (SEC proj_id was returning wrong fund)
  "K-US500X-A(A)": { kind: "kasset_fund", fundSlug: "k-us500x-a(a)" },
};

export function getAssetSource(symbol: string): AssetSource {
  return ASSET_SOURCES[symbol.toUpperCase()] ?? { kind: "manual" };
}

export function isLive(symbol: string): boolean {
  const src = getAssetSource(symbol);
  return src.kind !== "manual";
}
