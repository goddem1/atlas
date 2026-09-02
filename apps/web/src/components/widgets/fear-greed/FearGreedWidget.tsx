import { memo, useState } from "react";
import { GALLERY_FEAR_GREED } from "../../dashboard/widgetGalleryPreviewData";
import { FearGreedGauge } from "./FearGreedGauge";
import { FEAR_GREED_WIDGET_MOCK } from "./fearGreedMockData";
import "../portfolio/portfolio-widget.css";
import "../shared/portfolio-menu.css";
import "./fear-greed-widget.css";

type Props = {
  dragHandleClassName?: string;
  onDeleteWidget?: () => void;
  galleryPreview?: boolean;
};

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

function FearGreedWidgetCorner() {
  return (
    <svg
      className="fear-greed-widget-corner"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M18 7V0H11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FearGreedWidgetCard({
  value,
  dragHandleClassName,
  galleryPreview = false,
}: {
  value: number;
  dragHandleClassName?: string;
  galleryPreview?: boolean;
}) {
  return (
    <div className={cn("atlas-glass fear-greed-widget-card", galleryPreview && "fear-greed-widget-card--gallery")}>
      <FearGreedWidgetCorner />
      <div className={cn("fear-greed-widget-body", dragHandleClassName)}>
        <div className="fear-greed-widget-title">Страх и жадн.</div>
        <FearGreedGauge value={value} className="fear-greed-widget-gauge" />
      </div>
    </div>
  );
}

export const FearGreedWidget = memo(function FearGreedWidget({
  dragHandleClassName,
  onDeleteWidget,
  galleryPreview = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const value = galleryPreview ? GALLERY_FEAR_GREED.value : FEAR_GREED_WIDGET_MOCK.value;

  return (
    <div className="fear-greed-widget-shell">
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

      <FearGreedWidgetCard
        value={value}
        dragHandleClassName={dragHandleClassName}
        galleryPreview={galleryPreview}
      />
    </div>
  );
});
