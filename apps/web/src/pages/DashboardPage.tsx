import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo, lazy, Suspense, type CSSProperties } from "react";
import Draggable from "react-draggable";
import { DashboardSettings } from "../components/dashboard/DashboardSettings";
import { authClient } from "../lib/auth-client";
import { MacroCalendarWidget } from "../components/widgets/macro-calendar/MacroCalendarWidget";
import { PortfolioWidget } from "../components/widgets/portfolio/PortfolioWidget";
import { FedCurveWidget } from "../components/widgets/fed-curve/FedCurveWidget";
import { PriceSparklineWidget } from "../components/widgets/price-sparkline/PriceSparklineWidget";
import { WatchlistWidget, type WatchlistWidgetState } from "../components/widgets/watchlist/WatchlistWidget";
import { fetchProfile, fetchUserDashboardState, saveUserDashboardState, type ProfileUserResponse } from "../services/api";
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

const WidgetGalleryModal = lazy(() =>
  import("../components/dashboard/WidgetGalleryModal").then((m) => ({ default: m.WidgetGalleryModal })),
);
const MacroEventsModal = lazy(() =>
  import("../components/dashboard/MacroEventsModal").then((m) => ({ default: m.MacroEventsModal })),
);
const AuthModal = lazy(() => import("../components/auth/AuthModal").then((m) => ({ default: m.AuthModal })));

const SAVE_DEBOUNCE_MS = 600;

type DraggableWidgetProps = {
  widget: DashboardWidget;
  gridSize: number;
  onMove: (id: string, x: number, y: number) => void;
  onPriceSymbol: (id: string, symbol: string) => void;
  onRemove: (id: string) => void;
  onOpenMacroCalendar?: () => void;
  onFedCurveCompareDays?: (id: string, days: FedCurveCompareDays) => void;
  onWatchlistChange?: (id: string, state: WatchlistWidgetState) => void;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

function draggableWidgetPropsEqual(prev: DraggableWidgetProps, next: DraggableWidgetProps): boolean {
  return prev.widget === next.widget && prev.gridSize === next.gridSize;
}

const DraggableWidget = memo(function DraggableWidget({
  widget,
  gridSize,
  onMove,
  onPriceSymbol,
  onRemove,
  onOpenMacroCalendar,
  onFedCurveCompareDays,
  onWatchlistChange,
}: DraggableWidgetProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [watchlistSettingsOpen, setWatchlistSettingsOpen] = useState(false);
  const handleDelete = useCallback(() => onRemove(widget.id), [onRemove, widget.id]);
  const handlePriceSymbol = useCallback(
    (symbol: string) => onPriceSymbol(widget.id, symbol),
    [onPriceSymbol, widget.id],
  );
  const handleFedCurveCompareDays = useCallback(
    (days: FedCurveCompareDays) => onFedCurveCompareDays?.(widget.id, days),
    [onFedCurveCompareDays, widget.id],
  );
  const handleWatchlistChange = useCallback(
    (state: WatchlistWidgetState) => onWatchlistChange?.(widget.id, state),
    [onWatchlistChange, widget.id],
  );
  const handleWatchlistSettingsOpenChange = useCallback((open: boolean) => {
    setWatchlistSettingsOpen(open);
  }, []);
  const widthClass =
    widget.type === "portfolio"
      ? "w-[min(500px,calc(100vw-40px))]"
      : widget.type === "macro-calendar"
        ? "h-[300px] w-[min(550px,calc(100vw-40px))]"
        : widget.type === "watchlist"
          ? "h-[530px] w-[min(350px,calc(100vw-40px))]"
          : "w-[min(350px,calc(100vw-40px))]";

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".drag-handle"
      disabled={widget.type === "watchlist" && watchlistSettingsOpen}
      cancel=".price-widget-icon-button,.portfolio-menu-trigger,.btn-on-glass,.macro-cal-expand,.fed-curve-settings-popover,.fed-curve-settings-period-btn,.watchlist-list-header-select"
      bounds="parent"
      grid={[gridSize, gridSize]}
      position={isDragging ? undefined : { x: widget.x, y: widget.y }}
      onStart={() => setIsDragging(true)}
      onStop={(_, data) => {
        onMove(widget.id, data.x, data.y);
        setIsDragging(false);
      }}
    >
      <div
        ref={nodeRef}
        className={cn(
          "dashboard-widget-slot",
          `dashboard-widget-slot--${widget.type}`,
          "pointer-events-auto absolute left-0 top-0 inline-block",
          widthClass,
          "cursor-default touch-none",
        )}
      >
        {widget.type === "price-sparkline" ? (
          <PriceSparklineWidget
            dragHandleClassName="drag-handle"
            preferredSymbol={widget.symbol ?? null}
            onPreferredSymbolChange={handlePriceSymbol}
            onDeleteWidget={handleDelete}
          />
        ) : widget.type === "macro-calendar" ? (
          <MacroCalendarWidget
            dragHandleClassName="drag-handle"
            onDeleteWidget={handleDelete}
            onOpenFullCalendar={onOpenMacroCalendar}
          />
        ) : widget.type === "fed-curve" ? (
          <FedCurveWidget
            dragHandleClassName="drag-handle"
            compareDays={widget.compareDays}
            onCompareDaysChange={handleFedCurveCompareDays}
            onDeleteWidget={handleDelete}
          />
        ) : widget.type === "watchlist" ? (
          <WatchlistWidget
            dragHandleClassName="drag-handle"
            watchlistLists={widget.watchlistLists}
            activeWatchlistListId={widget.activeWatchlistListId}
            watchlistChangeDisplay={widget.watchlistChangeDisplay}
            watchlistChangePeriod={widget.watchlistChangePeriod}
            symbols={widget.symbols}
            onWatchlistChange={handleWatchlistChange}
            onDeleteWidget={handleDelete}
            onSettingsOpenChange={handleWatchlistSettingsOpenChange}
          />
        ) : (
          <PortfolioWidget onDeleteWidget={handleDelete} />
        )}
      </div>
    </Draggable>
  );
}, draggableWidgetPropsEqual);

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
  const [profileUser, setProfileUser] = useState<ProfileUserResponse | null>(null);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boundsVersion, setBoundsVersion] = useState(0);
  const skipPersistRef = useRef(true);
  /** Сброс гостевого дашборда только после выхода из аккаунта, не при каждой проверке сессии. */
  const wasLoggedInRef = useRef(false);

  const resetToGuestDashboard = useCallback(() => {
    const guest = applyGuestDashboard();
    setWidgets(guest.widgets);
    setPrefs(guest.prefs);
    setProfileUser(null);
    skipPersistRef.current = true;
    setBoundsVersion((v) => v + 1);
  }, []);

  const handleUserUpdated = useCallback(
    (updated: ProfileUserResponse) => {
      setProfileUser(updated);
      void refetchSession();
    },
    [refetchSession],
  );

  const dashboardUser = useMemo(() => {
    if (!session?.user) return null;
    const base = session.user;
    return {
      id: base.id,
      name: profileUser?.name ?? base.name,
      email: base.email,
      image: profileUser?.image ?? base.image ?? null,
      profileVersion: profileUser?.updatedAt ?? null,
    };
  }, [session?.user, profileUser]);

  useEffect(() => {
    setProfileUser(null);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchProfile()
      .then((profile) => {
        if (!cancelled) setProfileUser(profile);
      })
      .catch(() => {
        /* профиль из сессии */
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    document.documentElement.dataset.dashboardTheme = prefs.theme;
    return () => {
      delete document.documentElement.dataset.dashboardTheme;
    };
  }, [prefs.theme]);

  useEffect(() => {
    if (sessionPending) return;

    if (!isLoggedIn) {
      if (wasLoggedInRef.current) {
        resetToGuestDashboard();
        wasLoggedInRef.current = false;
      }
      return;
    }

    wasLoggedInRef.current = true;

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

  const setWatchlistState = useCallback((id: string, state: WatchlistWidgetState) => {
    setWidgets((ws) =>
      ws.map((w) =>
        w.id === id && w.type === "watchlist"
          ? {
              ...w,
              watchlistLists: state.watchlistLists,
              activeWatchlistListId: state.activeWatchlistListId,
              watchlistChangeDisplay: state.watchlistChangeDisplay,
              watchlistChangePeriod: state.watchlistChangePeriod,
              symbols: undefined,
            }
          : w,
      ),
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

  const openMacroCalendar = useCallback(() => setMacroOpen(true), []);

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
            w.type === "fed-curve" ||
            w.type === "watchlist" ? (
              <DraggableWidget
                key={w.id}
                widget={w}
                gridSize={DASHBOARD_GRID_SIZE}
                onMove={moveWidget}
                onPriceSymbol={setPriceWidgetSymbol}
                onRemove={removeWidget}
                onOpenMacroCalendar={openMacroCalendar}
                onFedCurveCompareDays={setFedCurveCompareDays}
                onWatchlistChange={setWatchlistState}
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
          user={dashboardUser}
          onOpenAuth={() => setAuthOpen(true)}
          onUserUpdated={handleUserUpdated}
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

      {galleryOpen ? (
        <Suspense fallback={null}>
          <WidgetGalleryModal
            open
            isLoggedIn={isLoggedIn}
            onClose={() => setGalleryOpen(false)}
            onPick={addWidget}
          />
        </Suspense>
      ) : null}
      {macroOpen ? (
        <Suspense fallback={null}>
          <MacroEventsModal open onClose={() => setMacroOpen(false)} />
        </Suspense>
      ) : null}
      {authOpen ? (
        <Suspense fallback={null}>
          <AuthModal
            open
            onClose={() => setAuthOpen(false)}
            onAuthenticated={() => {
              skipPersistRef.current = true;
              void refetchSession();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
