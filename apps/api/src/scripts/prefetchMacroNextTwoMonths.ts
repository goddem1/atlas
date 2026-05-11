import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runMacroPrefetchForNextTwoMonths } from "../jobs/macroCalendarPrefetchJob.js";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await runMacroPrefetchForNextTwoMonths(console, prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[macro-prefetch-next-two-months] failed:", err);
  process.exit(1);
});
