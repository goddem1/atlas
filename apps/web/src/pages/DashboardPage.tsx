import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Draggable from "react-draggable";
import { DashboardSettings } from "../components/dashboard/DashboardSettings";
import { MacroEventsModal } from "../components/dashboard/MacroEventsModal";
import { WidgetGalleryModal } from "../components/dashboard/WidgetGalleryModal";
import { MacroCalendarWidget } from "../components/widgets/macro-calendar/MacroCalendarWidget";
import { PortfolioWidget } from "../components/widgets/portfolio/PortfolioWidget";
import { PriceSparklineWidget } from "../components/widgets/price-sparkline/PriceSparklineWidget";
import "./dashboard-page.css";
import { getThemeColors, hexToRgba, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from "../lib/dashboardPrefs";
import {
  createWidgetId,
  DASHBOARD_GRID_SIZE,
  DASHBOARD_WIDGET_GAP,
  dashboardWidgetOuterSize,
  layoutAllWidgetsSequential,
  loadDashboardWidgets,
  resolveCollisions,
  saveDashboardWidgets,
  snapAndClampDashboardPosition,
  type DashboardWidget,
  type DashboardWidgetType,
} from "../lib/dashboardWidgets";

type DraggableWidgetProps = {
  widget: DashboardWidget;
  gridSize: number;
  onMove: (id: string, x: number, y: number) => void;
  onPriceSymbol: (id: string, symbol: string) => void;
  onRemove: (id: string) => void;
  onOpenMacroCalendar?: () => void;
};

function DraggableWidget({ widget, gridSize, onMove, onPriceSymbol, onRemove, onOpenMacroCalendar }: DraggableWidgetProps) {
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
      cancel=".price-widget-icon-button,.portfolio-menu-trigger,.btn-on-glass,.macro-cal-expand"
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
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => loadDashboardPrefs());
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => loadDashboardWidgets());
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [macroOpen, setMacroOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boundsVersion, setBoundsVersion] = useState(0);

  useEffect(() => {
    saveDashboardPrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    document.documentElement.dataset.dashboardTheme = prefs.theme;
    return () => {
      delete document.documentElement.dataset.dashboardTheme;
    };
  }, [prefs.theme]);

  useEffect(() => {
    saveDashboardWidgets(widgets);
  }, [widgets]);

  const relayoutFromBoard = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const vw = window.innerWidth;
    setWidgets((ws) => layoutAllWidgetsSequential(ws, width, height, vw));
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

  const removeWidget = useCallback((id: string) => {
    setWidgets((ws) => ws.filter((w) => w.id !== id));
  }, []);

  const addWidget = useCallback((type: DashboardWidgetType) => {
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
  }, []);

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
            w.type === "price-sparkline" || w.type === "portfolio" || w.type === "macro-calendar" ? (
              <DraggableWidget
                key={w.id}
                widget={w}
                gridSize={DASHBOARD_GRID_SIZE}
                onMove={moveWidget}
                onPriceSymbol={setPriceWidgetSymbol}
                onRemove={removeWidget}
                onOpenMacroCalendar={() => setMacroOpen(true)}
              />
            ) : null,
          )}
        </div>
      </main>

      <div className="dashboard-floating-actions">
        <DashboardSettings prefs={prefs} onChange={setPrefs} />
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

      <WidgetGalleryModal open={galleryOpen} onClose={() => setGalleryOpen(false)} onPick={addWidget} />
      <MacroEventsModal open={macroOpen} onClose={() => setMacroOpen(false)} />
    </div>
  );
}
