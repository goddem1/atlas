import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const mdPath = path.resolve(
  "C:/Users/6maks/.cursor/projects/c-Users-6maks-atlas/uploads/logos-0.md",
);
const outDir = fileURLToPath(new URL("../data/", import.meta.url));
const outPath = path.join(outDir, "cryptologos-index.json");

const md = await readFile(mdPath, "utf8");
const index: Record<string, string> = {};

for (const match of md.matchAll(/^(.+?) \(([A-Za-z0-9]+)\) logo/gm)) {
  const name = match[1]!.trim();
  const symbol = match[2]!.toUpperCase();
  index[symbol] = `${slugifyName(name)}-${symbol.toLowerCase()}`;
}

await mkdir(outDir, { recursive: true });
await writeFile(outPath, JSON.stringify(index, null, 2));
console.log("symbols", Object.keys(index).length, "written to", outPath);
