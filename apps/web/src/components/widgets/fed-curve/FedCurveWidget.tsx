import { useEffect, useMemo, useState, memo, lazy, Suspense } from "react";
import type { BondsYieldCurveResponse } from "@atlas-v1/shared";
import {
  FED_CURVE_DEFAULT_COMPARE_DAYS,
  normalizeFedCurveCompareDays,
  type FedCurveCompareDays,
} from "../../../lib/fedCurveComparePeriod";
import { fetchBondsYieldCurve } from "../../../services/api";
import { GALLERY_FED_CURVE } from "../../dashboard/widgetGalleryPreviewData";
import { FedCurveCard } from "./FedCurveCard";
import { valuesByTenors } from "./fedCurveChartUtils";
import "./fed-curve-widget.css";

const FedCurveDetailModal = lazy(() =>
  import("./FedCurveDetailModal").then((m) => ({ default: m.FedCurveDetailModal })),
);

const POLL_MS = 5 * 60 * 1000;

type Props = {
  dragHandleClassName?: string;
  compareDays?: number;
  onCompareDaysChange?: (days: FedCurveCompareDays) => void;
  onDeleteWidget?: () => void;
  /** Статичное превью для галереи виджетов — без API. */
  galleryPreview?: boolean;
};

export const FedCurveWidget = memo(function FedCurveWidget({
  dragHandleClassName,
  compareDays: compareDaysProp,
  onCompareDaysChange,
  onDeleteWidget,
  galleryPreview = false,
}: Props) {
  const compareDays = normalizeFedCurveCompareDays(compareDaysProp ?? FED_CURVE_DEFAULT_COMPARE_DAYS);
  const [data, setData] = useState<BondsYieldCurveResponse | null>(() =>
    galleryPreview ? GALLERY_FED_CURVE : null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (galleryPreview) return;
    let cancelled = false;

    const load = () => {
      fetchBondsYieldCurve(compareDays)
        .then((body) => {
          if (cancelled) return;
          setData(body);
        })
        .catch(() => {
          if (cancelled) return;
          setData(null);
        });
    };

    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [compareDays, galleryPreview]);

  const tenors = data?.tenors ?? [];
  const currentValues = useMemo(
    () => (data ? valuesByTenors(tenors, data.current) : []),
    [data, tenors],
  );
  const monthAgoValues = useMemo(
    () => (data ? valuesByTenors(tenors, data.monthAgo) : []),
    [data, tenors],
  );

  return (
    <>
      <FedCurveCard
        dragHandleClassName={dragHandleClassName}
        onDeleteWidget={onDeleteWidget}
        compareDays={compareDays}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        onCompareDaysChange={onCompareDaysChange}
        onOpenDetail={() => setDetailOpen(true)}
        tenors={tenors}
        currentValues={currentValues}
        monthAgoValues={monthAgoValues}
        asOfDate={data?.asOfDate ?? null}
        monthAgoDate={data?.monthAgoDate ?? null}
      />
      {!galleryPreview && detailOpen ? (
        <Suspense fallback={null}>
          <FedCurveDetailModal open onClose={() => setDetailOpen(false)} compareDays={compareDays} />
        </Suspense>
      ) : null}
    </>
  );
});
