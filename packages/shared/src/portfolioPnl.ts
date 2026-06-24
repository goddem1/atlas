export function parsePortfolioUsd(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Сумма P/L портфеля = сумма pnlUsd по всем активам в summary. */
export function sumPortfolioPnlUsd(assets: ReadonlyArray<{ pnlUsd: string }>): number {
  return assets.reduce((acc, asset) => acc + parsePortfolioUsd(asset.pnlUsd), 0);
}

export function roundPortfolioUsdForDisplay(value: number): number {
  return Math.round(value);
}
