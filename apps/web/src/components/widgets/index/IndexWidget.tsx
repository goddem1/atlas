import { lazy, memo, Suspense, useEffect, useMemo, useState } from "react";
import { useIsBackdropBlurPaused } from "../../../lib/useIsBackdropBlurPaused";
import { GALLERY_INDEX } from "../../dashboard/widgetGalleryPreviewData";
import { FearGreedGauge } from "../fear-greed/FearGreedGauge";
import {
  formatIndexChangePercent,
  indexChangeTone,
} from "./indexFormat";
import {
  DEFAULT_MARKET_INDEX_ID,
  formatMarketIndexValue,
  getMarketIndexMeta,
  normalizeMarketIndexId,
  type MarketIndexId,
} from "./marketIndexCatalog";
import { hasMarketIndexKlineChart } from "./marketIndexKlineTarget";
import { resolveMarketIndexSnapshot } from "./marketIndexFromApi";
import { setMarketIndicesPollingPaused, useMarketIndicesData } from "./useMarketIndicesData";
import "../portfolio/portfolio-widget.css";
import "../shared/portfolio-menu.css";
import "./index-widget.css";

const IndexPickerModal = lazy(() =>
  import("../shared/IndexPickerModal").then((m) => ({ default: m.IndexPickerModal })),
);

type Props = {
  dragHandleClassName?: string;
  indexId?: MarketIndexId | null;
  onIndexIdChange?: (indexId: MarketIndexId) => void;
  onDeleteWidget?: () => void;
  onOpenExtendedChart?: (indexId: MarketIndexId) => void;
  galleryPreview?: boolean;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

function IndexWidgetCard({
  indexId,
  dragHandleClassName,
  galleryPreview = false,
  onOpenPicker,
  snapshots,
}: {
  indexId: MarketIndexId;
  dragHandleClassName?: string;
  galleryPreview?: boolean;
  onOpenPicker?: () => void;
  snapshots: ReturnType<typeof useMarketIndicesData>["snapshots"];
}) {
  const meta = getMarketIndexMeta(indexId);
  const snapshot = useMemo(() => {
    if (galleryPreview && indexId === "total-2") {
      return { value: GALLERY_INDEX.value, changePercent: GALLERY_INDEX.changePercent };
    }
    return resolveMarketIndexSnapshot(indexId, snapshots);
  }, [galleryPreview, indexId, snapshots]);
  const changeTone = indexChangeTone(snapshot.changePercent);
  const isGauge = meta.displayMode === "gauge";
  const dragCn = cn("index-widget-body", dragHandleClassName);

  return (
    <div
      className={cn(
        "atlas-glass index-widget-card",
        isGauge && "index-widget-card--gauge",
        galleryPreview && "index-widget-card--gallery",
      )}
    >
      <div className={dragCn}>
        <div className={cn("index-widget-header", isGauge && "index-widget-header--gauge")}>
          <button
            type="button"
            className="index-widget-name index-widget-name-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPicker?.();
            }}
          >
            {meta.label}
          </button>
        </div>

        {isGauge ? (
          <FearGreedGauge
            value={snapshot.value}
            className="index-widget-gauge"
            displayValue={formatMarketIndexValue(indexId, snapshot.value)}
          />
        ) : (
          <>
            <div className="index-widget-value">{formatMarketIndexValue(indexId, snapshot.value)}</div>
            <div className={`index-widget-change index-widget-change--${changeTone}`}>
              {formatIndexChangePercent(snapshot.changePercent)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const IndexWidget = memo(function IndexWidget({
  dragHandleClassName,
  indexId: indexIdProp,
  onIndexIdChange,
  onDeleteWidget,
  onOpenExtendedChart,
  galleryPreview = false,
}: Props) {
  const overlayOpen = useIsBackdropBlurPaused();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const indexId = normalizeMarketIndexId(indexIdProp ?? DEFAULT_MARKET_INDEX_ID);
  const marketData = useMarketIndicesData(!galleryPreview && !overlayOpen);
  const canOpenExtendedChart = hasMarketIndexKlineChart(indexId);

  useEffect(() => {
    if (galleryPreview) return;
    setMarketIndicesPollingPaused(overlayOpen || pickerOpen);
  }, [galleryPreview, overlayOpen, pickerOpen]);

  return (
    <div className="index-widget-shell">
      <div
        className={cn("portfolio-menu-wrap", menuOpen ? "is-open" : undefined)}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          type="button"
          className="portfolio-menu-trigger atlas-fg-primary"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Меню виджета"
          aria-expanded={menuOpen}
        >
          <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="portfolio-menu-trigger-icon" />
        </button>
        <div className="portfolio-menu-rail" aria-hidden={!menuOpen}>
          {!galleryPreview && canOpenExtendedChart ? (
            <button
              type="button"
              className="btn-on-glass btn-on-glass--soft"
              onClick={() => {
                setMenuOpen(false);
                onOpenExtendedChart?.(indexId);
              }}
              aria-label="Открыть расширенный график"
            >
              <img src="/assets/portfolio-ui/bars.svg" alt="" className="portfolio-menu-circle-icon" />
            </button>
          ) : null}
          <button
            type="button"
            className="btn-on-glass btn-on-glass--soft"
            onClick={() => onDeleteWidget?.()}
            aria-label="Удалить виджет"
          >
            <img
              src="/assets/portfolio-ui/close.svg"
              alt=""
              className="portfolio-menu-circle-icon portfolio-menu-circle-icon-close"
            />
          </button>
        </div>
      </div>

      <IndexWidgetCard
        indexId={indexId}
        dragHandleClassName={dragHandleClassName}
        galleryPreview={galleryPreview}
        snapshots={galleryPreview ? null : marketData.snapshots}
        onOpenPicker={galleryPreview ? undefined : () => setPickerOpen(true)}
      />

      {!galleryPreview && pickerOpen ? (
        <Suspense fallback={null}>
          <IndexPickerModal
            open
            activeIndexId={indexId}
            onClose={() => setPickerOpen(false)}
            onSelect={(item) => onIndexIdChange?.(item.id)}
          />
        </Suspense>
      ) : null}
    </div>
  );
});
