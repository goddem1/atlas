import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const updatedFromPrior = await prisma.$executeRawUnsafe(`
      WITH ordered AS (
        SELECT
          id,
          LAG(actual) OVER (PARTITION BY "indicatorId" ORDER BY date, id) AS prev_actual
        FROM "MacroDataPoint"
      )
      UPDATE "MacroDataPoint" AS m
      SET previous = ordered.prev_actual
      FROM ordered
      WHERE m.id = ordered.id
        AND ordered.prev_actual IS NOT NULL
        AND m.previous IS DISTINCT FROM ordered.prev_actual
    `);

    const clearedFirstRows = await prisma.$executeRawUnsafe(`
      WITH ordered AS (
        SELECT
          id,
          LAG(actual) OVER (PARTITION BY "indicatorId" ORDER BY date, id) AS prev_actual
        FROM "MacroDataPoint"
      )
      UPDATE "MacroDataPoint" AS m
      SET previous = NULL
      FROM ordered
      WHERE m.id = ordered.id
        AND ordered.prev_actual IS NULL
        AND m.previous IS NOT NULL
    `);

    console.log(
      `[backfill-macro-previous] updated_from_prior=${updatedFromPrior} cleared_first_rows=${clearedFirstRows}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[backfill-macro-previous] failed:", err);
  process.exit(1);
});
