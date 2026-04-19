import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Draggable from "react-draggable";
import { DashboardSettings } from "../components/dashboard/DashboardSettings";
import { WidgetGalleryModal } from "../components/dashboard/WidgetGalleryModal";
import { PortfolioWidget } from "../components/widgets/portfolio/PortfolioWidget";
import { PriceSparklineWidget } from "../components/widgets/price-sparkline/PriceSparklineWidget";
import {
  DASHBOARD_GRID_SIZE,
  getThemeColors,
  hexToRgba,
  loadDashboardPrefs,
  saveDashboardPrefs,
  type DashboardPrefs,
} from "../lib/dashboardPrefs";
import {
  createWidgetId,
  loadDashboardWidgets,
  saveDashboardWidgets,
  snapToGrid,
  type DashboardWidget,
  type DashboardWidgetType,
} from "../lib/dashboardWidgets";

type DraggableWidgetProps = {
  widget: DashboardWidget;
  gridSize: number;
  onMove: (id: string, x: number, y: number) => void;
  onPriceSymbol: (id: string, symbol: string) => void;
  onRemove: (id: string) => void;
};

function DraggableWidget({ widget, gridSize, onMove, onPriceSymbol, onRemove }: DraggableWidgetProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const widthClass =
    widget.type === "portfolio" ? "w-[min(500px,calc(100vw-3rem))]" : "w-[min(350px,calc(100vw-3rem))]";

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".drag-handle"
      cancel=".price-widget-icon-button,.portfolio-menu-trigger,.portfolio-menu-circle-btn"
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
        ) : (
          <PortfolioWidget onDeleteWidget={() => onRemove(widget.id)} />
        )}
      </div>
    </Draggable>
  );
}

function PlusIcon() {
  return (
    <svg className="h-7 w-7 text-slate-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function DashboardPage() {
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => loadDashboardPrefs());
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() =>
    loadDashboardWidgets(DASHBOARD_GRID_SIZE),
  );
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    saveDashboardPrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    saveDashboardWidgets(widgets);
  }, [widgets]);

  useEffect(() => {
    setWidgets((ws) =>
      ws.map((w) => {
        const s = snapToGrid(w.x, w.y, DASHBOARD_GRID_SIZE);
        return { ...w, x: s.x, y: s.y };
      }),
    );
  }, []);

  const moveWidget = useCallback((id: string, x: number, y: number) => {
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, x, y } : w)));
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

  const addWidget = useCallback(
    (type: DashboardWidgetType) => {
      setWidgets((ws) => {
        const idx = ws.length;
        const { x, y } = snapToGrid(
          DASHBOARD_GRID_SIZE * (1 + idx * 2),
          DASHBOARD_GRID_SIZE * (1 + Math.min(idx, 6)),
          DASHBOARD_GRID_SIZE,
        );
        return [...ws, { id: createWidgetId(), type, x, y }];
      });
    },
    [],
  );

  const mainStyle = useMemo((): CSSProperties => {
    const colors = getThemeColors(prefs.theme);
    const line = hexToRgba(colors.gridColor, prefs.gridOpacity / 100);
    return {
      backgroundColor: colors.background,
      backgroundImage: [
        `linear-gradient(to right, ${line} 1px, transparent 1px)`,
        `linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
      ].join(","),
      backgroundSize: `${DASHBOARD_GRID_SIZE}px ${DASHBOARD_GRID_SIZE}px`,
    };
  }, [prefs.gridOpacity, prefs.theme]);

  return (
    <div className="relative min-h-[100dvh] text-slate-100">
      <main className="absolute inset-0 overflow-hidden" style={mainStyle}>
        {/* Виджеты не в одном inline-ряду с main: иначе при resize ширина соседа двигает базу следующего, а transform добавляется к ней. */}
        <div className="pointer-events-none absolute inset-0">
          {widgets.map((w) =>
            w.type === "price-sparkline" || w.type === "portfolio" ? (
              <DraggableWidget
                key={w.id}
                widget={w}
                gridSize={DASHBOARD_GRID_SIZE}
                onMove={moveWidget}
                onPriceSymbol={setPriceWidgetSymbol}
                onRemove={removeWidget}
              />
            ) : null,
          )}
        </div>
      </main>

      <div className="pointer-events-auto fixed right-4 top-4 z-[300] flex flex-row-reverse items-start gap-2">
        <DashboardSettings prefs={prefs} onChange={setPrefs} />
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-600/80 bg-slate-800/95 shadow-lg backdrop-blur-sm transition hover:bg-slate-700/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-label="Добавить виджет"
          aria-haspopup="dialog"
          aria-expanded={galleryOpen}
          onClick={() => setGalleryOpen(true)}
        >
          <PlusIcon />
        </button>
      </div>

      <WidgetGalleryModal open={galleryOpen} onClose={() => setGalleryOpen(false)} onPick={addWidget} />
    </div>
  );
}
