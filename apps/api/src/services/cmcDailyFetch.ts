import type { FundingRateEntry } from "@atlas-v1/shared";

const CMC_BASE = "https://pro-api.coinmarketcap.com";
const CMC_KEYLESS = "https://pro-api.coinmarketcap.com/public-api";

function getCmcApiKey(): string {
  const key = process.env.CMC_API_KEY?.trim();
  if (!key) {
    throw new Error("CMC_API_KEY is required for keyed CoinMarketCap endpoints");
  }
  return key;
}

const FUNDING_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "DOT", "LINK"] as const;

type CmcMarketPair = {
  market_pair?: string;
  exchange?: {
    exchange_slug?: string;
    exchange_name?: string;
  };
  exchange_reported_quotes?: Array<{
    funding_rate?: number;
    last_updated?: string;
  }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchFearGreedLatest(): Promise<{ value: number; classification: string }> {
  const res = await fetch(`${CMC_KEYLESS}/v3/fear-and-greed/latest`);
  if (!res.ok) {
    throw new Error(`Fear&Greed fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    data?: { value?: number; value_classification?: string };
  };
  const value = data.data?.value;
  const classification = data.data?.value_classification;
  if (typeof value !== "number" || typeof classification !== "string") {
    throw new Error("Fear&Greed response is missing required fields");
  }
  return { value, classification };
}

export async function fetchGlobalMetrics(): Promise<{
  btcDominance: number;
  ethDominance: number;
  totalMarketCap: number;
  altcoinMarketCap: number;
}> {
  const res = await fetch(`${CMC_KEYLESS}/v1/global-metrics/quotes/latest`);
  if (!res.ok) {
    throw new Error(`GlobalMetrics fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    data?: {
      btc_dominance?: number;
      eth_dominance?: number;
      quote?: { USD?: { total_market_cap?: number; altcoin_market_cap?: number } };
    };
  };
  const d = data.data;
  const quote = d?.quote?.USD;
  if (
    typeof d?.btc_dominance !== "number" ||
    typeof d?.eth_dominance !== "number" ||
    typeof quote?.total_market_cap !== "number" ||
    typeof quote?.altcoin_market_cap !== "number"
  ) {
    throw new Error("GlobalMetrics response is missing required fields");
  }
  return {
    btcDominance: d.btc_dominance,
    ethDominance: d.eth_dominance,
    totalMarketCap: quote.total_market_cap,
    altcoinMarketCap: quote.altcoin_market_cap,
  };
}

export async function fetchBtcEthMarketCap(): Promise<{ btcMarketCap: number; ethMarketCap: number }> {
  const res = await fetch(`${CMC_BASE}/v2/cryptocurrency/quotes/latest?symbol=BTC,ETH`, {
    headers: { "X-CMC_PRO_API_KEY": getCmcApiKey() },
  });
  if (!res.ok) {
    throw new Error(`BTC/ETH quotes fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    data?: {
      BTC?: Array<{ quote?: { USD?: { market_cap?: number } } }>;
      ETH?: Array<{ quote?: { USD?: { market_cap?: number } } }>;
    };
  };
  const btcMcap = data.data?.BTC?.[0]?.quote?.USD?.market_cap;
  const ethMcap = data.data?.ETH?.[0]?.quote?.USD?.market_cap;
  if (typeof btcMcap !== "number" || typeof ethMcap !== "number") {
    throw new Error("BTC/ETH quotes response is missing market_cap");
  }
  return { btcMarketCap: btcMcap, ethMarketCap: ethMcap };
}

export async function fetchAltcoinSeasonIndex(): Promise<{
  altcoinSeasonIndex: number;
  altcoinSeasonMarketCap: number | null;
}> {
  const res = await fetch(`${CMC_KEYLESS}/v1/altcoin-season-index/latest`);
  if (!res.ok) {
    throw new Error(`AltcoinSeason fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    data?: { altcoin_index?: number; altcoin_marketcap?: number | null };
  };
  const altcoinSeasonIndex = data.data?.altcoin_index;
  if (typeof altcoinSeasonIndex !== "number") {
    throw new Error("AltcoinSeason response is missing altcoin_index");
  }
  const altcoinSeasonMarketCap = data.data?.altcoin_marketcap;
  return {
    altcoinSeasonIndex,
    altcoinSeasonMarketCap: typeof altcoinSeasonMarketCap === "number" ? altcoinSeasonMarketCap : null,
  };
}

export async function fetchFundingRates(): Promise<FundingRateEntry[]> {
  const results: FundingRateEntry[] = [];
  const apiKey = getCmcApiKey();

  for (const symbol of FUNDING_SYMBOLS) {
    await sleep(200);
    try {
      const res = await fetch(
        `${CMC_BASE}/v5/cryptocurrency/derivatives/market-pairs/list/latest` +
          `?crypto_symbol=${symbol}&category=perpetual&limit=50`,
        { headers: { "X-CMC_PRO_API_KEY": apiKey } },
      );
      if (!res.ok) continue;

      const data = (await res.json()) as {
        data?: { market_pairs?: CmcMarketPair[] };
      };
      const pairs = data.data?.market_pairs ?? [];
      const binancePair =
        pairs.find((pair) => pair.exchange?.exchange_slug === "binance") ?? pairs[0];
      if (!binancePair) continue;

      const quote = binancePair.exchange_reported_quotes?.[0];
      if (typeof quote?.funding_rate !== "number" || !quote.last_updated) continue;

      results.push({
        symbol,
        pair: binancePair.market_pair ?? `${symbol}/USDT`,
        exchange: binancePair.exchange?.exchange_name ?? "Unknown",
        fundingRate: quote.funding_rate,
        lastUpdated: quote.last_updated,
      });
    } catch {
      continue;
    }
  }

  return results;
}
