import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { importMacroCalendarRange } from "../jobs/macroCalendarPrefetchJob.js";

function argValue(flag: string): string | null {
  const pair = process.argv.find((x) => x.startsWith(`${flag}=`));
  if (!pair) return null;
  return pair.slice(flag.length + 1).trim() || null;
}

async function main(): Promise<void> {
  const from = argValue("--from");
  const to = argValue("--to");

  if (!from || !to) {
    console.error(
      "Usage: tsx src/scripts/importMacroCalendarRange.ts --from=YYYY-MM-DD --to=YYYY-MM-DD [--only-missing]",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const onlyMissing = process.argv.includes("--only-missing");
    const stats = await importMacroCalendarRange(prisma, console, { from, to, onlyMissing });
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[macro-import-range] failed:", err);
  process.exit(1);
});
