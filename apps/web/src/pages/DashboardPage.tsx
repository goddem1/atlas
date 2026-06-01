import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Draggable from "react-draggable";
import { AuthModal } from "../components/auth/AuthModal";
import { DashboardSettings } from "../components/dashboard/DashboardSettings";
import { authClient } from "../lib/auth-client";
import { MacroEventsModal } from "../components/dashboard/MacroEventsModal";
import { WidgetGalleryModal } from "../components/dashboard/WidgetGalleryModal";
import { MacroCalendarWidget } from "../components/widgets/macro-calendar/MacroCalendarWidget";
import { PortfolioWidget } from "../components/widgets/portfolio/PortfolioWidget";
import { FedCurveWidget } from "../components/widgets/fed-curve/FedCurveWidget";
import { PriceSparklineWidget } from "../components/widgets/price-sparkline/PriceSparklineWidget";
import { fetchUserDashboardState, saveUserDashboardState } from "../services/api";
import "./dashboard-page.css";
import { applyGuestDashboard } from "../lib/guestDashboard";
import { getThemeColors, hexToRgba, type DashboardPrefs } from "../lib/dashboardPrefs";
import {
  createWidgetId,
  DASHBOARD_GRID_SIZE,
  DASHBOARD_WIDGET_GAP,
  dashboardWidgetOuterSize,
  layoutAllWidgetsSequential,
  layoutDashboardWidgetsForBoard,
  resolveCollisions,
  snapAndClampDashboardPosition,
  type DashboardWidget,
  type DashboardWidgetType,
} from "../lib/dashboardWidgets";
import type { FedCurveCompareDays } from "../lib/fedCurveComparePeriod";
import { toUserDashboardState } from "../lib/userDashboardStorage";

const SAVE_DEBOUNCE_MS = 600;

type DraggableWidgetProps = {
  widget: DashboardWidget;
  gridSize: number;
  onMove: (id: string, x: number, y: number) => void;
  onPriceSymbol: (id: string, symbol: string) => void;
  onRemove: (id: string) => void;
  onOpenMacroCalendar?: () => void;
  onFedCurveCompareDays?: (id: string, days: FedCurveCompareDays) => void;
};

function DraggableWidget({
  widget,
  gridSize,
  onMove,
  onPriceSymbol,
  onRemove,
  onOpenMacroCalendar,
  onFedCurveCompareDays,
}: DraggableWidgetProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const widthClass =
    widget.type === "portfolio"
      ? "w-[min(500px,calc(100vw-40px))]"
      : widget.type === "macro-calendar"
        ? "h-[300px] w-[min(550px,calc(100vw-40px))]"
        : "w-[min(350px,calc(100vw-40px))]";

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".drag-handle"
      cancel=".price-widget-icon-button,.portfolio-menu-trigger,.btn-on-glass,.macro-cal-expand,.fed-curve-settings-popover,.fed-curve-settings-period-btn"
      bounds="parent"
      grid={[gridSize, gridSize]}
      position={{ x: widget.x, y: widget.y }}
      onDrag={(_, data) => onMove(widget.id, data.x, data.y)}
      onStop={(_, data) => onMove(widget.id, data.x, data.y)}
    >
      <div
        ref={nodeRef}
        className={`pointer-events-auto absolute left-0 top-0 inline-block ${widthClass} cursor-default touch-none`}
      >
        {widget.type === "price-sparkline" ? (
          <PriceSparklineWidget
            dragHandleClassName="drag-handle"
            preferredSymbol={widget.symbol ?? null}
            onPreferredSymbolChange={(symbol) => onPriceSymbol(widget.id, symbol)}
            onDeleteWidget={() => onRemove(widget.id)}
          />
        ) : widget.type === "macro-calendar" ? (
          <MacroCalendarWidget
            dragHandleClassName="drag-handle"
            onDeleteWidget={() => onRemove(widget.id)}
            onOpenFullCalendar={onOpenMacroCalendar}
          />
        ) : widget.type === "fed-curve" ? (
          <FedCurveWidget
            dragHandleClassName="drag-handle"
            compareDays={widget.compareDays}
            onCompareDaysChange={(days) => onFedCurveCompareDays?.(widget.id, days)}
            onDeleteWidget={() => onRemove(widget.id)}
          />
        ) : (
          <PortfolioWidget onDeleteWidget={() => onRemove(widget.id)} />
        )}
      </div>
    </Draggable>
  );
}

function PlusIcon() {
  return (
    <svg
      className="dashboard-floating-action-icon dashboard-floating-action-icon--plus"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function DashboardPage() {
  const { data: session, isPending: sessionPending, refetch: refetchSession } = authClient.useSession();
  const isLoggedIn = Boolean(session?.user);
  const userId = session?.user?.id ?? null;

  const guestSnapshot = useMemo(() => applyGuestDashboard(), []);
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => guestSnapshot.prefs);
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => guestSnapshot.widgets);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [macroOpen, setMacroOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boundsVersion, setBoundsVersion] = useState(0);
  const skipPersistRef = useRef(true);

  const resetToGuestDashboard = useCallback(() => {
    const guest = applyGuestDashboard();
    setWidgets(guest.widgets);
    setPrefs(guest.prefs);
    skipPersistRef.current = true;
    setBoundsVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.dashboardTheme = prefs.theme;
    return () => {
      delete document.documentElement.dataset.dashboardTheme;
    };
  }, [prefs.theme]);

  useEffect(() => {
    if (sessionPending) return;

    if (!isLoggedIn) {
      resetToGuestDashboard();
      return;
    }

    let cancelled = false;
    skipPersistRef.current = true;

    void (async () => {
      try {
        const state = await fetchUserDashboardState();
        if (cancelled) return;
        const rect = boardRef.current?.getBoundingClientRect();
        setWidgets(
          layoutDashboardWidgetsForBoard(
            state.widgets,
            rect?.width,
            rect?.height,
            window.innerWidth,
          ),
        );
        setPrefs(state.prefs);
        setBoundsVersion((v) => v + 1);
      } catch {
        if (!cancelled) resetToGuestDashboard();
      } finally {
        if (!cancelled) {
          queueMicrotask(() => {
            skipPersistRef.current = false;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, userId, sessionPending, resetToGuestDashboard]);

  useEffect(() => {
    if (!isLoggedIn || sessionPending || skipPersistRef.current) return;

    const timer = window.setTimeout(() => {
      void saveUserDashboardState(toUserDashboardState(widgets, prefs)).catch(() => {
        /* сеть / 401 — не блокируем UI */
      });
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [widgets, prefs, isLoggedIn, sessionPending]);

  const relayoutFromBoard = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const vw = window.innerWidth;
    setWidgets((ws) => layoutDashboardWidgetsForBoard(ws, width, height, vw));
  }, []);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBoundsVersion((v) => v + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    relayoutFromBoard();
  }, [boundsVersion, relayoutFromBoard]);

  const moveWidget = useCallback((id: string, x: number, y: number) => {
    const el = boardRef.current;
    const vw = window.innerWidth;
    const rect = el?.getBoundingClientRect();
    const bw = rect && rect.width > 0 ? rect.width : Math.max(DASHBOARD_GRID_SIZE * 4, vw - 40);
    const bh = rect && rect.height > 0 ? rect.height : Math.max(DASHBOARD_GRID_SIZE * 4, window.innerHeight - 40);

    setWidgets((ws) => {
      const self = ws.find((w) => w.id === id);
      if (!self) return ws;
      const snapped = snapAndClampDashboardPosition(x, y, self.type, bw, bh, vw);
      const resolved = resolveCollisions(ws, id, snapped, bw, bh, vw);
      return ws.map((w) => (w.id === id ? { ...w, ...resolved } : w));
    });
  }, []);

  const setPriceWidgetSymbol = useCallback((id: string, symbol: string) => {
    const sym = symbol.trim().toUpperCase();
    setWidgets((ws) =>
      ws.map((w) => (w.id === id && w.type === "price-sparkline" ? { ...w, symbol: sym } : w)),
    );
  }, []);

  const setFedCurveCompareDays = useCallback((id: string, days: FedCurveCompareDays) => {
    setWidgets((ws) =>
      ws.map((w) => (w.id === id && w.type === "fed-curve" ? { ...w, compareDays: days } : w)),
    );
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets((ws) => ws.filter((w) => w.id !== id));
  }, []);

  const addWidget = useCallback(
    (type: DashboardWidgetType) => {
    if (type === "portfolio" && !isLoggedIn) return;

    const el = boardRef.current;
    const vw = window.innerWidth;
    const rect = el?.getBoundingClientRect();
    const bw = rect && rect.width > 0 ? rect.width : Math.max(DASHBOARD_GRID_SIZE * 4, vw - 40);
    const bh = rect && rect.height > 0 ? rect.height : Math.max(DASHBOARD_GRID_SIZE * 4, window.innerHeight - 40);

    setWidgets((ws) => {
      const idx = ws.length;
      const { h } = dashboardWidgetOuterSize(type, vw);
      const stepY = Math.ceil((h + DASHBOARD_WIDGET_GAP) / DASHBOARD_GRID_SIZE) * DASHBOARD_GRID_SIZE;
      const snapped = snapAndClampDashboardPosition(0, idx * stepY, type, bw, bh, vw);
      const next = [...ws, { id: createWidgetId(), type, x: snapped.x, y: snapped.y }];
      return layoutAllWidgetsSequential(next, bw, bh, vw);
    });
  },
    [isLoggedIn],
  );

  const mainStyle = useMemo((): CSSProperties => {
    const colors = getThemeColors(prefs.theme);
    const line = hexToRgba(colors.gridColor, prefs.gridOpacity / 100);
    return {
      ["--dashboard-bg-color" as string]: colors.background,
      ["--dashboard-grid-line" as string]: line,
      ["--dashboard-grid-size" as string]: `${DASHBOARD_GRID_SIZE}px`,
    };
  }, [prefs.gridOpacity, prefs.theme]);

  return (
    <div className="dashboard-page-root relative min-h-[100dvh]" data-dashboard-theme={prefs.theme}>
      <div className="dashboard-quick-tabs" aria-label="Быстрый доступ к вкладкам">
        <div className="dashboard-quick-tabs-dim" aria-hidden="true" />
        <div className="dashboard-quick-tabs-hitbox" aria-hidden="true" />
        <div className="dashboard-quick-tabs-trigger" aria-hidden="true" />
        <div className="dashboard-quick-tabs-menu">
          <button
            type="button"
            className="dashboard-quick-tabs-item dashboard-quick-tabs-item--calendar"
            aria-label="Открыть календарь"
            onClick={() => setMacroOpen(true)}
          >
            <img src="/assets/portfolio-ui/calendar.svg" alt="" aria-hidden="true" className="dashboard-quick-tabs-item-icon" />
          </button>
        </div>
      </div>

      <main className="dashboard-main-surface" style={mainStyle}>
        {/* Область виджетов: inset 20px — вне этой зоны нельзя ставить (bounds родителя для Draggable). */}
        <div ref={boardRef} className="pointer-events-none absolute inset-5">
          {widgets.map((w) =>
            w.type === "price-sparkline" ||
            w.type === "portfolio" ||
            w.type === "macro-calendar" ||
            w.type === "fed-curve" ? (
              <DraggableWidget
                key={w.id}
                widget={w}
                gridSize={DASHBOARD_GRID_SIZE}
                onMove={moveWidget}
                onPriceSymbol={setPriceWidgetSymbol}
                onRemove={removeWidget}
                onOpenMacroCalendar={() => setMacroOpen(true)}
                onFedCurveCompareDays={setFedCurveCompareDays}
              />
            ) : null,
          )}
        </div>
      </main>

      <div className="dashboard-floating-actions">
        <DashboardSettings
          prefs={prefs}
          onChange={setPrefs}
          isLoggedIn={isLoggedIn}
          user={
            session?.user
              ? { id: session.user.id, name: session.user.name, email: session.user.email }
              : null
          }
          onOpenAuth={() => setAuthOpen(true)}
          onSignOut={() =>
            void authClient.signOut().then(() => {
              resetToGuestDashboard();
              void refetchSession();
            })
          }
        />
        <button
          type="button"
          className="dashboard-floating-action-btn btn-glass"
          aria-label="Добавить виджет"
          aria-haspopup="dialog"
          aria-expanded={galleryOpen}
          onClick={() => setGalleryOpen(true)}
        >
          <PlusIcon />
        </button>
      </div>

      <WidgetGalleryModal
        open={galleryOpen}
        isLoggedIn={isLoggedIn}
        onClose={() => setGalleryOpen(false)}
        onPick={addWidget}
      />
      <MacroEventsModal open={macroOpen} onClose={() => setMacroOpen(false)} />
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => {
          skipPersistRef.current = true;
          void refetchSession();
        }}
      />
    </div>
  );
}
