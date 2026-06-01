import type { UserDashboardState } from "@atlas-v1/shared";
import type { DashboardPrefs } from "./dashboardPrefs";
import type { DashboardWidget } from "./dashboardWidgets";

export function toUserDashboardState(widgets: DashboardWidget[], prefs: DashboardPrefs): UserDashboardState {
  return {
    version: 1,
    widgets,
    prefs,
  };
}
