import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const coins = [
    { symbol: "BTC", name: "Bitcoin", pairSymbol: "BTCUSDT" },
    { symbol: "ETH", name: "Ethereum", pairSymbol: "ETHUSDT" },
    { symbol: "HBAR", name: "Hedera", pairSymbol: "HBARUSDT" },
    { symbol: "SUI", name: "Sui", pairSymbol: "SUIUSDT" },
    { symbol: "PEPE", name: "Pepe", pairSymbol: "PEPEUSDT" },
  ] as const;

  for (const coin of coins) {
    await prisma.cryptocurrencyList.upsert({
      where: { symbol: coin.symbol },
      create: {
        symbol: coin.symbol,
        name: coin.name,
        iconUrl: `/assets/crypto/${coin.symbol}.svg`,
        pairSymbol: coin.pairSymbol,
      },
      update: {
        name: coin.name,
        iconUrl: `/assets/crypto/${coin.symbol}.svg`,
        pairSymbol: coin.pairSymbol,
      },
    });
  }
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
