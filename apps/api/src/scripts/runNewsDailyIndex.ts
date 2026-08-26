/**
 * Ручной прогон дневного индекса новостей (один LLM-вызов → БД).
 * Пример: pnpm exec tsx src/scripts/runNewsDailyIndex.ts
 *         pnpm exec tsx src/scripts/runNewsDailyIndex.ts --force 2026-07-27
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { computeAndPersistDailyNewsIndex } from "../services/newsWidgetLlm.js";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"),
});

const args = process.argv.slice(2);
const force = args.includes("--force");
const dayArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

const prisma = new PrismaClient();
const log = {
  info: (obj: unknown, msg?: string) => console.log(msg ?? "", obj),
  warn: (obj: unknown, msg?: string) => console.warn(msg ?? "", obj),
};

try {
  const result = await computeAndPersistDailyNewsIndex(prisma, {
    day: dayArg,
    skipIfLlmExists: !force,
    log,
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
