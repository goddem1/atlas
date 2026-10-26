import type { UserDashboardState } from "@atlas-v1/shared";
import type { DashboardPrefs } from "./dashboardPrefs";
import type { DashboardWidget } from "./dashboardWidgets";

/** Сериализация в API: x → доля ширины доски, y без изменений. */
export function toUserDashboardState(
  widgets: DashboardWidget[],
  prefs: DashboardPrefs,
  boardWidth: number,
): UserDashboardState {
  const width = Math.max(1, boardWidth);
  return {
    version: 1,
    boardWidth: width,
    prefs,
    widgets: widgets.map((widget) => ({
      ...widget,
      x: widget.x / width,
    })),
  };
}
