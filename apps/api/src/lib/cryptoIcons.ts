import { access, copyFile, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";
import type { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const SPOTHQ_ROOT = path.dirname(require.resolve("cryptocurrency-icons/package.json"));
const SPOTHQ_COLOR_DIR = path.join(SPOTHQ_ROOT, "svg", "color");
const CRYPTOFONT_ROOT = path.dirname(require.resolve("@cryptofonts/cryptofont/package.json"));
const CRYPTOFONT_SVG_DIR = path.join(CRYPTOFONT_ROOT, "SVG");
const PUBLIC_CRYPTO_DIR = fileURLToPath(new URL("../../../web/public/assets/crypto/", import.meta.url));
const CRYPTOFLOGOS_INDEX_PATH = fileURLToPath(new URL("../data/cryptologos-index.json", import.meta.url));

const CRYPTOFLOGOS_BASE = "https://cryptologos.cc/logos";
const CRYPTOFLOGOS_FETCH_AGENT = new Agent({
  headersTimeout: 120_000,
  bodyTimeout: 120_000,
  connectTimeout: 30_000,
});

export const DEFAULT_ICON_URL = "/assets/crypto/generic.svg";

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function publicIconFilePath(symbol: string): string {
  return path.join(PUBLIC_CRYPTO_DIR, `${symbol.toUpperCase()}.svg`);
}

function publicIconUrl(symbol: string): string {
  return `/assets/crypto/${symbol.toUpperCase()}.svg`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

let cryptologosIndexPromise: Promise<Record<string, string>> | null = null;

async function loadCryptologosIndex(): Promise<Record<string, string>> {
  if (!cryptologosIndexPromise) {
    cryptologosIndexPromise = readFile(CRYPTOFLOGOS_INDEX_PATH, "utf8").then(
      (raw) => JSON.parse(raw) as Record<string, string>,
    );
  }
  return cryptologosIndexPromise;
}

function cryptologosSlugCandidates(
  symbol: string,
  name: string | null | undefined,
  index: Record<string, string>,
): string[] {
  const upper = symbol.toUpperCase();
  const lower = upper.toLowerCase();
  const candidates: string[] = [];

  if (index[upper]) {
    candidates.push(index[upper]!);
  }
  if (name?.trim()) {
    candidates.push(`${slugifyName(name)}-${lower}`);
  }
  candidates.push(`${lower}-${lower}`, lower);

  return [...new Set(candidates.filter(Boolean))];
}

async function fetchCryptologosSvg(slug: string): Promise<string | null> {
  try {
    const res = await undiciFetch(`${CRYPTOFLOGOS_BASE}/${slug}-logo.svg`, {
      dispatcher: CRYPTOFLOGOS_FETCH_AGENT,
    });
    if (!res.ok) {
      return null;
    }
    const svg = await res.text();
    if (!svg.trimStart().startsWith("<")) {
      return null;
    }
    return svg;
  } catch {
    return null;
  }
}

export function spothqIconPath(symbol: string): string {
  return path.join(SPOTHQ_COLOR_DIR, `${symbol.toLowerCase()}.svg`);
}

export function cryptofontIconPath(symbol: string): string {
  return path.join(CRYPTOFONT_SVG_DIR, `${symbol.toLowerCase()}.svg`);
}

export async function hasPublicIcon(symbol: string): Promise<boolean> {
  return fileExists(publicIconFilePath(symbol.toUpperCase()));
}

export async function resolvePublicIconUrl(symbol: string): Promise<string> {
  const normalized = symbol.toUpperCase();
  if (await fileExists(publicIconFilePath(normalized))) {
    return publicIconUrl(normalized);
  }
  return DEFAULT_ICON_URL;
}

/** Удаляет PNG из public и сбрасывает iconUrl в БД с `.png` на актуальный SVG/generic. */
export async function purgePngCryptoIcons(
  prisma: PrismaClient,
): Promise<{ removedFiles: number; updatedDb: number }> {
  let removedFiles = 0;
  for (const file of await readdir(PUBLIC_CRYPTO_DIR)) {
    if (!file.toLowerCase().endsWith(".png")) {
      continue;
    }
    await unlink(path.join(PUBLIC_CRYPTO_DIR, file));
    removedFiles += 1;
  }

  const coinsWithPng = await prisma.cryptocurrencyList.findMany({
    where: { iconUrl: { endsWith: ".png" } },
    select: { id: true, symbol: true },
  });

  let updatedDb = 0;
  for (const coin of coinsWithPng) {
    const iconUrl = await resolvePublicIconUrl(coin.symbol);
    await prisma.cryptocurrencyList.update({
      where: { id: coin.id },
      data: { iconUrl },
    });
    updatedDb += 1;
  }

  return { removedFiles, updatedDb };
}

export async function copySpothqIconToPublic(
  symbol: string,
  options?: { overwrite?: boolean },
): Promise<boolean> {
  const normalized = symbol.toUpperCase();
  if (!options?.overwrite && (await hasPublicIcon(normalized))) {
    return false;
  }
  const source = spothqIconPath(normalized);
  if (!(await fileExists(source))) {
    return false;
  }
  await mkdir(PUBLIC_CRYPTO_DIR, { recursive: true });
  await copyFile(source, publicIconFilePath(normalized));
  return true;
}

export async function copyCryptofontIconToPublic(
  symbol: string,
  options?: { overwrite?: boolean },
): Promise<boolean> {
  const normalized = symbol.toUpperCase();
  if (!options?.overwrite && (await hasPublicIcon(normalized))) {
    return false;
  }
  const source = cryptofontIconPath(normalized);
  if (!(await fileExists(source))) {
    return false;
  }
  await mkdir(PUBLIC_CRYPTO_DIR, { recursive: true });
  await copyFile(source, publicIconFilePath(normalized));
  return true;
}

/** Скачивает SVG с [CryptoLogos.cc](https://cryptologos.cc/logos/). Существующие файлы не перезаписывает. */
export async function copyCryptologosIconToPublic(
  symbol: string,
  options?: { overwrite?: boolean; name?: string },
): Promise<boolean> {
  const normalized = symbol.toUpperCase();
  if (!options?.overwrite && (await hasPublicIcon(normalized))) {
    return false;
  }

  const index = await loadCryptologosIndex();
  const candidates = cryptologosSlugCandidates(normalized, options?.name, index);

  for (const slug of candidates) {
    const svg = await fetchCryptologosSvg(slug);
    if (!svg) {
      continue;
    }
    await mkdir(PUBLIC_CRYPTO_DIR, { recursive: true });
    await writeFile(publicIconFilePath(normalized), svg);
    return true;
  }

  return false;
}

/** Подтягивает иконку: spothq → cryptofont → cryptologos. */
export async function ensureIconAndResolveUrl(
  symbol: string,
  options?: { overwrite?: boolean; name?: string },
): Promise<string> {
  const normalized = symbol.toUpperCase();
  if (!options?.overwrite && (await hasPublicIcon(normalized))) {
    return resolvePublicIconUrl(normalized);
  }

  await copySpothqIconToPublic(normalized, options);
  if (!(await hasPublicIcon(normalized))) {
    await copyCryptofontIconToPublic(normalized, options);
  }
  if (!(await hasPublicIcon(normalized))) {
    await copyCryptologosIconToPublic(normalized, options);
  }

  return resolvePublicIconUrl(normalized);
}

export async function syncAllCryptoIcons(
  prisma: PrismaClient,
  options?: { overwrite?: boolean; purgePng?: boolean },
): Promise<{
  total: number;
  removedPng: number;
  pngDbReset: number;
  copiedSpothq: number;
  copiedCryptofont: number;
  copiedCryptologos: number;
  updated: number;
  generic: number;
}> {
  let removedPng = 0;
  let pngDbReset = 0;
  if (options?.purgePng !== false) {
    const purged = await purgePngCryptoIcons(prisma);
    removedPng = purged.removedFiles;
    pngDbReset = purged.updatedDb;
  }

  const coins = await prisma.cryptocurrencyList.findMany({
    select: { id: true, symbol: true, name: true, iconUrl: true },
    orderBy: { symbol: "asc" },
  });

  let copiedSpothq = 0;
  let copiedCryptofont = 0;
  let copiedCryptologos = 0;
  let updated = 0;
  let generic = 0;

  for (const coin of coins) {
    const symbol = coin.symbol.toUpperCase();

    if (await copySpothqIconToPublic(symbol, options)) {
      copiedSpothq += 1;
    } else if (await copyCryptofontIconToPublic(symbol, options)) {
      copiedCryptofont += 1;
    } else if (await copyCryptologosIconToPublic(symbol, { ...options, name: coin.name })) {
      copiedCryptologos += 1;
    }

    const iconUrl = await resolvePublicIconUrl(symbol);
    if (iconUrl === DEFAULT_ICON_URL) {
      generic += 1;
    }

    if (coin.iconUrl !== iconUrl) {
      await prisma.cryptocurrencyList.update({
        where: { id: coin.id },
        data: { iconUrl },
      });
      updated += 1;
    }
  }

  return {
    total: coins.length,
    removedPng,
    pngDbReset,
    copiedSpothq,
    copiedCryptofont,
    copiedCryptologos,
    updated,
    generic,
  };
}
