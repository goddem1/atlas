import { memo, useEffect, useState } from "react";
import { useIsBackdropBlurPaused } from "../../../lib/useIsBackdropBlurPaused";
import { GALLERY_INDEX_BOARD } from "../../dashboard/widgetGalleryPreviewData";
import {
  formatMarketIndexBoardValue,
  indexBoardChangeTone,
  INDEX_BOARD_ROWS,
} from "./indexBoardCatalog";
import { resolveMarketIndexSnapshot } from "./marketIndexFromApi";
import { setMarketIndicesPollingPaused, useMarketIndicesData } from "./useMarketIndicesData";
import "../portfolio/portfolio-widget.css";
import "../shared/portfolio-menu.css";
import "./index-board-widget.css";

type Props = {
  dragHandleClassName?: string;
  onDeleteWidget?: () => void;
  galleryPreview?: boolean;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

function TrendIndicator({ tone }: { tone: "pos" | "neg" | "zero" }) {
  if (tone === "zero") {
    return (
      <span className="index-board-trend index-board-trend--zero" aria-hidden>
        —
      </span>
    );
  }
  return <span className={cn("index-board-trend", `index-board-trend--${tone}`)} aria-hidden />;
}

export const IndexBoardWidget = memo(function IndexBoardWidget({
  dragHandleClassName,
  onDeleteWidget,
  galleryPreview = false,
}: Props) {
  const overlayOpen = useIsBackdropBlurPaused();
  const [menuOpen, setMenuOpen] = useState(false);
  const marketData = useMarketIndicesData(!galleryPreview && !overlayOpen);

  useEffect(() => {
    if (galleryPreview) return;
    setMarketIndicesPollingPaused(overlayOpen);
  }, [galleryPreview, overlayOpen]);

  const snapshots = galleryPreview ? GALLERY_INDEX_BOARD : marketData.snapshots;

  return (
    <div className="index-board-shell">
      <div
        className={cn("portfolio-menu-wrap", menuOpen ? "is-open" : undefined)}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        {!galleryPreview ? (
          <>
            <button
              type="button"
              className="portfolio-menu-trigger atlas-fg-primary"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Меню виджета"
              aria-expanded={menuOpen}
            >
              <img src="/assets/portfolio-ui/arrow_down.svg" alt="" className="portfolio-menu-trigger-icon" />
            </button>
            <div className="portfolio-menu-rail" aria-hidden={!menuOpen}>
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
          </>
        ) : null}
      </div>

      <div
        className={cn(
          "atlas-glass index-board-card",
          galleryPreview && "index-board-card--gallery",
        )}
      >
        <div className={cn("index-board-body", dragHandleClassName)}>
          <ul className="index-board-list">
            {INDEX_BOARD_ROWS.map((row) => {
              const snapshot = resolveMarketIndexSnapshot(row.id, snapshots);
              const tone = indexBoardChangeTone(row.id, snapshot);
              return (
                <li key={row.id} className="index-board-row">
                  <span className="index-board-label">{row.label}</span>
                  <span className="index-board-value-wrap">
                    <span className="index-board-value">
                      {formatMarketIndexBoardValue(row.id, snapshot.value)}
                    </span>
                    <TrendIndicator tone={tone} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
});
