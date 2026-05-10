export type AssetSource =
  | { kind: "coingecko"; id: string }
  | { kind: "manual" };

export const ASSET_SOURCES: Record<string, AssetSource> = {
  BTC: { kind: "coingecko", id: "bitcoin" },
  ETH: { kind: "coingecko", id: "ethereum" },
  SOL: { kind: "coingecko", id: "solana" },
  BNB: { kind: "coingecko", id: "binancecoin" },
  ADA: { kind: "coingecko", id: "cardano" },
  XRP: { kind: "coingecko", id: "ripple" },
  DOGE: { kind: "coingecko", id: "dogecoin" },
  USDT: { kind: "coingecko", id: "tether" },
};

export function getAssetSource(symbol: string): AssetSource {
  return ASSET_SOURCES[symbol.toUpperCase()] ?? { kind: "manual" };
}

export function isLive(symbol: string): boolean {
  return getAssetSource(symbol).kind !== "manual";
}
