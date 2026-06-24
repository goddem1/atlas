import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { syncAllCryptoIcons } from "../lib/cryptoIcons.js";

async function main(): Promise<void> {
  const overwrite = process.argv.includes("--overwrite");
  const prisma = new PrismaClient();

  try {
    const result = await syncAllCryptoIcons(prisma, { overwrite });
    console.log(
      `Crypto icons synced: ${result.total} assets, ${result.removedPng} PNG removed, ${result.pngDbReset} PNG URLs reset, ${result.copiedSpothq} from spothq, ${result.copiedCryptofont} from cryptofont, ${result.copiedCryptologos} from cryptologos, ${result.updated} DB rows updated, ${result.generic} without dedicated icon`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
