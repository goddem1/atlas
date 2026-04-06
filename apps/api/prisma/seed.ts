import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.cryptocurrencyList.upsert({
    where: { symbol: "BTC" },
    create: {
      symbol: "BTC",
      name: "Bitcoin",
      iconUrl: "/assets/crypto/BTC.svg",
      pairSymbol: "BTCUSDT",
    },
    update: {
      name: "Bitcoin",
      iconUrl: "/assets/crypto/BTC.svg",
      pairSymbol: "BTCUSDT",
    },
  });

  await prisma.cryptocurrencyList.upsert({
    where: { symbol: "ETH" },
    create: {
      symbol: "ETH",
      name: "Ethereum",
      iconUrl: "/assets/crypto/ETH.svg",
      pairSymbol: "ETHUSDT",
    },
    update: {
      name: "Ethereum",
      iconUrl: "/assets/crypto/ETH.svg",
      pairSymbol: "ETHUSDT",
    },
  });
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
