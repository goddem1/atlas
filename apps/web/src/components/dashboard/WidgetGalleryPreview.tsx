import type { DashboardWidgetType } from "../../lib/dashboardWidgets";
import { FedCurveWidget } from "../widgets/fed-curve/FedCurveWidget";
import { MacroCalendarWidget } from "../widgets/macro-calendar/MacroCalendarWidget";
import { PortfolioWidget } from "../widgets/portfolio/PortfolioWidget";
import { PriceSparklineWidget } from "../widgets/price-sparkline/PriceSparklineWidget";
import { WatchlistWidget } from "../widgets/watchlist/WatchlistWidget";
import { WidgetGalleryScaledFrame } from "./WidgetGalleryScaledFrame";

type Props = {
  widgetType: DashboardWidgetType;
};

function LiveWidgetPreview({
  widgetType,
  children,
}: {
  widgetType: DashboardWidgetType;
  children: React.ReactNode;
}) {
  return (
    <div className="widget-gallery-preview widget-gallery-preview--live" aria-hidden>
      <WidgetGalleryScaledFrame widgetType={widgetType}>{children}</WidgetGalleryScaledFrame>
    </div>
  );
}

export function WidgetGalleryPreview({ widgetType }: Props) {
  switch (widgetType) {
    case "price-sparkline":
      return (
        <LiveWidgetPreview widgetType="price-sparkline">
          <PriceSparklineWidget galleryPreview />
        </LiveWidgetPreview>
      );
    case "watchlist":
      return (
        <LiveWidgetPreview widgetType="watchlist">
          <WatchlistWidget galleryPreview />
        </LiveWidgetPreview>
      );
    case "macro-calendar":
      return (
        <LiveWidgetPreview widgetType="macro-calendar">
          <MacroCalendarWidget galleryPreview />
        </LiveWidgetPreview>
      );
    case "fed-curve":
      return (
        <LiveWidgetPreview widgetType="fed-curve">
          <FedCurveWidget galleryPreview />
        </LiveWidgetPreview>
      );
    case "portfolio":
      return (
        <LiveWidgetPreview widgetType="portfolio">
          <PortfolioWidget galleryPreview />
        </LiveWidgetPreview>
      );
    default:
      return null;
  }
}
