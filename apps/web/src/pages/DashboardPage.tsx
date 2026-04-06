import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Draggable from "react-draggable";
import { DashboardSettings } from "../components/dashboard/DashboardSettings";
import { WidgetGalleryModal } from "../components/dashboard/WidgetGalleryModal";
import { PriceSparklineWidget } from "../components/widgets/PriceSparklineWidget";
import {
  GRID_LINE_ALPHA,
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
};

function DraggablePriceWidget({ widget, gridSize, onMove, onPriceSymbol }: DraggableWidgetProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".drag-handle"
      cancel=".price-widget-icon-button"
      bounds="parent"
      grid={[gridSize, gridSize]}
      position={{ x: widget.x, y: widget.y }}
      onDrag={(_, data) => onMove(widget.id, data.x, data.y)}
      onStop={(_, data) => onMove(widget.id, data.x, data.y)}
    >
      <div
        ref={nodeRef}
        className="inline-block w-[min(380px,calc(100vw-3rem))] cursor-default touch-none"
      >
        <PriceSparklineWidget
          dragHandleClassName="drag-handle"
          preferredSymbol={widget.symbol ?? null}
          onPreferredSymbolChange={(symbol) => onPriceSymbol(widget.id, symbol)}
        />
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
    loadDashboardWidgets(loadDashboardPrefs().gridSize),
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
        const s = snapToGrid(w.x, w.y, prefs.gridSize);
        return { ...w, x: s.x, y: s.y };
      }),
    );
  }, [prefs.gridSize]);

  const moveWidget = useCallback((id: string, x: number, y: number) => {
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, x, y } : w)));
  }, []);

  const setPriceWidgetSymbol = useCallback((id: string, symbol: string) => {
    const sym = symbol.trim().toUpperCase();
    setWidgets((ws) =>
      ws.map((w) => (w.id === id && w.type === "price-sparkline" ? { ...w, symbol: sym } : w)),
    );
  }, []);

  const addWidget = useCallback(
    (type: DashboardWidgetType) => {
      if (type !== "price-sparkline") return;
      setWidgets((ws) => {
        const idx = ws.length;
        const { x, y } = snapToGrid(
          prefs.gridSize * (1 + idx * 2),
          prefs.gridSize * (1 + Math.min(idx, 6)),
          prefs.gridSize,
        );
        return [...ws, { id: createWidgetId(), type, x, y }];
      });
    },
    [prefs.gridSize],
  );

  const mainStyle = useMemo((): CSSProperties => {
    const line = hexToRgba(prefs.gridColor, GRID_LINE_ALPHA);
    return {
      backgroundColor: prefs.background,
      backgroundImage: [
        `linear-gradient(to right, ${line} 1px, transparent 1px)`,
        `linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
      ].join(","),
      backgroundSize: `${prefs.gridSize}px ${prefs.gridSize}px`,
    };
  }, [prefs.background, prefs.gridColor, prefs.gridSize]);

  return (
    <div className="relative min-h-[100dvh] text-slate-100">
      <main className="absolute inset-0 overflow-hidden" style={mainStyle}>
        {widgets.map((w) =>
          w.type === "price-sparkline" ? (
            <DraggablePriceWidget
              key={w.id}
              widget={w}
              gridSize={prefs.gridSize}
              onMove={moveWidget}
              onPriceSymbol={setPriceWidgetSymbol}
            />
          ) : null,
        )}
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
