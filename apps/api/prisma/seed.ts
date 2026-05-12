import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BINANCE_EXCHANGE_INFO_URL = "https://api.binance.com/api/v3/exchangeInfo";
const DEFAULT_ICON_URL = "/assets/crypto/generic.svg";

type BinanceExchangeInfo = {
  symbols?: Array<{
    symbol?: string;
    status?: string;
    baseAsset?: string;
    quoteAsset?: string;
    isSpotTradingAllowed?: boolean;
  }>;
};

const DISPLAY_NAME_BY_SYMBOL: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  HBAR: "Hedera",
  SUI: "Sui",
  PEPE: "Pepe",
  BNB: "BNB",
  SOL: "Solana",
  XRP: "XRP",
  ADA: "Cardano",
  DOGE: "Dogecoin",
  TRX: "TRON",
  LINK: "Chainlink",
  AVAX: "Avalanche",
  TON: "Toncoin",
  SHIB: "Shiba Inu",
};

async function hasLocalIcon(symbol: string): Promise<boolean> {
  const iconPath = new URL(`../../web/public/assets/crypto/${symbol}.svg`, import.meta.url);
  try {
    await access(iconPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function fetchSpotUsdtPairs(): Promise<Array<{ symbol: string; pairSymbol: string }>> {
  const response = await fetch(BINANCE_EXCHANGE_INFO_URL);
  if (!response.ok) {
    throw new Error(`Binance exchangeInfo ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as BinanceExchangeInfo;
  const pairs = new Map<string, string>();

  for (const row of payload.symbols ?? []) {
    const symbol = row.baseAsset?.trim().toUpperCase();
    const pairSymbol = row.symbol?.trim().toUpperCase();
    if (!symbol || !pairSymbol) continue;
    if (row.quoteAsset !== "USDT") continue;
    if (row.status !== "TRADING") continue;
    if (row.isSpotTradingAllowed !== true) continue;
    if (!pairs.has(symbol)) {
      pairs.set(symbol, pairSymbol);
    }
  }

  return Array.from(pairs, ([symbol, pairSymbol]) => ({ symbol, pairSymbol })).sort((a, b) =>
    a.symbol.localeCompare(b.symbol),
  );
}

async function main() {
  const existing = await prisma.cryptocurrencyList.findMany({
    select: { symbol: true, name: true },
  });
  const existingNameBySymbol = new Map(existing.map((coin) => [coin.symbol.toUpperCase(), coin.name]));
  const pairs = await fetchSpotUsdtPairs();

  for (const coin of pairs) {
    const iconUrl = (await hasLocalIcon(coin.symbol)) ? `/assets/crypto/${coin.symbol}.svg` : DEFAULT_ICON_URL;
    const name = existingNameBySymbol.get(coin.symbol) ?? DISPLAY_NAME_BY_SYMBOL[coin.symbol] ?? coin.symbol;
    await prisma.cryptocurrencyList.upsert({
      where: { symbol: coin.symbol },
      create: {
        symbol: coin.symbol,
        name,
        iconUrl,
        pairSymbol: coin.pairSymbol,
      },
      update: {
        name,
        iconUrl,
        pairSymbol: coin.pairSymbol,
      },
    });
  }

  console.log(`Synced ${pairs.length} USDT spot assets into CryptocurrencyList`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
