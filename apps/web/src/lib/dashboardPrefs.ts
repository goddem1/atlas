const STORAGE_KEY = "atlas-v1-dashboard-prefs";

export type DashboardPrefs = {
  background: string;
  gridColor: string;
  gridSize: number;
};

export const defaultDashboardPrefs: DashboardPrefs = {
  background: "#020617",
  gridColor: "#94a3b8",
  gridSize: 50,
};

/** Прозрачность линий сетки поверх фона (не выносим в UI, чтобы не перегружать панель). */
export const GRID_LINE_ALPHA = 0.12;

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.trim().replace(/^#/, "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return `rgba(148, 163, 184, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function clampGridSize(n: number): number {
  return Math.min(200, Math.max(8, Math.round(n)));
}

export function loadDashboardPrefs(): DashboardPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultDashboardPrefs };
    const j = JSON.parse(raw) as Partial<DashboardPrefs>;
    return {
      background: typeof j.background === "string" ? j.background : defaultDashboardPrefs.background,
      gridColor: typeof j.gridColor === "string" ? j.gridColor : defaultDashboardPrefs.gridColor,
      gridSize: clampGridSize(
        typeof j.gridSize === "number" ? j.gridSize : defaultDashboardPrefs.gridSize,
      ),
    };
  } catch {
    return { ...defaultDashboardPrefs };
  }
}

export function saveDashboardPrefs(prefs: DashboardPrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...prefs,
        gridSize: clampGridSize(prefs.gridSize),
      }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}
