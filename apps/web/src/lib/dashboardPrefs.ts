const STORAGE_KEY = "atlas-v1-dashboard-prefs";

export const DASHBOARD_GRID_SIZE = 50;

export type DashboardTheme = "light" | "dark";

export type DashboardPrefs = {
  theme: DashboardTheme;
  /** Прозрачность линий сетки в процентах (0..100). */
  gridOpacity: number;
};

export const defaultDashboardPrefs: DashboardPrefs = {
  theme: "light",
  gridOpacity: 20,
};

export function getThemeColors(theme: DashboardTheme): { background: string; gridColor: string } {
  if (theme === "dark") {
    return {
      background: "#0f0f0f",
      gridColor: "#F2F2F7",
    };
  }
  return {
    background: "#F2F2F7",
    gridColor: "#0f0f0f",
  };
}

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

export function clampGridOpacity(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function loadDashboardPrefs(): DashboardPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultDashboardPrefs };
    const j = JSON.parse(raw) as Partial<DashboardPrefs> & {
      background?: string;
      gridColor?: string;
      gridSize?: number;
    };
    let theme: DashboardTheme = defaultDashboardPrefs.theme;
    if (j.theme === "light" || j.theme === "dark") {
      theme = j.theme;
    } else if (typeof j.background === "string" && typeof j.gridColor === "string") {
      // Миграция старого формата prefs: background + gridColor
      if (j.background.toLowerCase() === "#0f0f0f") {
        theme = "dark";
      } else if (j.background.toLowerCase() === "#f2f2f7") {
        theme = "light";
      }
    }
    return {
      theme,
      gridOpacity: clampGridOpacity(
        typeof j.gridOpacity === "number" ? j.gridOpacity : defaultDashboardPrefs.gridOpacity,
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
        theme: prefs.theme,
        gridOpacity: clampGridOpacity(prefs.gridOpacity),
      }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}
