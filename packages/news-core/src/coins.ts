export type SeedCoin = {
  symbol: string;
  name: string;
  binanceSymbol: string | null;
  isStable: boolean;
  aliases: Array<{ alias: string; lang: string }>;
};

function coin(
  symbol: string,
  name: string,
  binanceSymbol: string | null,
  aliases: Array<[string, string]>,
  isStable = false,
): SeedCoin {
  return {
    symbol,
    name,
    binanceSymbol,
    isStable,
    aliases: aliases.map(([alias, lang]) => ({ alias, lang })),
  };
}

export const COIN_CATALOG: SeedCoin[] = [
  coin("BTC", "Bitcoin", "BTCUSDT", [["btc", "en"], ["bitcoin", "en"], ["биткоин", "ru"], ["биток", "ru"]]),
  coin("ETH", "Ethereum", "ETHUSDT", [["eth", "en"], ["ethereum", "en"], ["эфир", "ru"], ["эфириум", "ru"]]),
  coin("SOL", "Solana", "SOLUSDT", [["sol", "en"], ["solana", "en"], ["солана", "ru"], ["солану", "ru"], ["соланы", "ru"]]),
  coin("TON", "Toncoin", "TONUSDT", [["ton", "en"], ["toncoin", "en"], ["тон", "ru"], ["тонкоин", "ru"], ["тонкоину", "ru"]]),
  coin("XRP", "XRP", "XRPUSDT", [["xrp", "en"], ["рипл", "ru"]]),
  coin("DOGE", "Dogecoin", "DOGEUSDT", [["doge", "en"], ["dogecoin", "en"], ["дож", "ru"], ["доги", "ru"]]),
  coin("BNB", "BNB", "BNBUSDT", [["bnb", "en"], ["бинанс коин", "ru"]]),
  coin("ADA", "Cardano", "ADAUSDT", [["ada", "en"], ["cardano", "en"], ["кардано", "ru"]]),
  coin("AVAX", "Avalanche", "AVAXUSDT", [["avax", "en"], ["avalanche", "en"], ["авакс", "ru"]]),
  coin("LINK", "Chainlink", "LINKUSDT", [["link", "en"], ["chainlink", "en"], ["чейнлинк", "ru"]]),
  coin("LTC", "Litecoin", "LTCUSDT", [["ltc", "en"], ["litecoin", "en"], ["лайткоин", "ru"]]),
  coin("TRX", "TRON", "TRXUSDT", [["trx", "en"], ["tron", "en"], ["трон", "ru"]]),
  coin("NEAR", "NEAR", "NEARUSDT", [["near", "en"], ["нир", "ru"]]),
  coin("APT", "Aptos", "APTUSDT", [["apt", "en"], ["aptos", "en"], ["аптос", "ru"]]),
  coin("SUI", "Sui", "SUIUSDT", [["sui", "en"], ["суи", "ru"]]),
  coin("DOT", "Polkadot", "DOTUSDT", [["dot", "en"], ["polkadot", "en"], ["полкадот", "ru"]]),
  coin("PEPE", "Pepe", "PEPEUSDT", [["pepe", "en"], ["пепе", "ru"]]),
  coin("WIF", "dogwifhat", "WIFUSDT", [["wif", "en"], ["dogwifhat", "en"]]),
  coin("NOT", "Notcoin", "NOTUSDT", [["not", "en"], ["notcoin", "en"], ["ноткоин", "ru"]]),
  coin("DOGS", "DOGS", "DOGSUSDT", [["dogs", "en"]]),
  coin("USDT", "Tether", null, [["usdt", "en"], ["тезер", "ru"]], true),
  coin("USDC", "USD Coin", null, [["usdc", "en"]], true),
];
