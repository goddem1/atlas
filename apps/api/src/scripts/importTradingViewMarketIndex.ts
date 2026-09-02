import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { importMarketIndexDailyBars } from "../services/marketIndexDailyBarImport.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiEnvPath = path.resolve(scriptDir, "../../.env");
const dockerEnvPath = path.resolve(scriptDir, "../../../../docker/.env");

dotenv.config({ path: apiEnvPath });
if (fs.existsSync(dockerEnvPath)) {
  dotenv.config({ path: dockerEnvPath, override: false });
}

function readArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (hit) return hit.slice(prefix.length).trim();
  return fallback;
}

const prisma = new PrismaClient();

try {
  const indexId = readArg("index-id", "btc-dominance");
  const symbol = readArg("symbol", "");
  const range = Number.parseInt(readArg("range", "3300"), 10);

  const result = await importMarketIndexDailyBars(prisma, {
    indexId,
    symbol: symbol || undefined,
    range: Number.isFinite(range) ? range : 3300,
  });

  console.log("[tv:import-index] done", result);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
