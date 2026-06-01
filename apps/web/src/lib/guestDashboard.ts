import { defaultDashboardPrefs, type DashboardPrefs } from "./dashboardPrefs";
import {
  GUEST_DASHBOARD_WIDGETS,
  layoutGuestDashboardWidgets,
  type DashboardWidget,
} from "./dashboardWidgets";

export { GUEST_DASHBOARD_WIDGETS };

export const GUEST_DASHBOARD_PREFS: DashboardPrefs = {
  ...defaultDashboardPrefs,
};

export function cloneGuestDashboardWidgets(): DashboardWidget[] {
  return layoutGuestDashboardWidgets();
}

export function applyGuestDashboard(): { widgets: DashboardWidget[]; prefs: DashboardPrefs } {
  return {
    widgets: layoutGuestDashboardWidgets(),
    prefs: { ...GUEST_DASHBOARD_PREFS },
  };
}

export { layoutGuestDashboardWidgets };
