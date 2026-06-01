import { useEffect, useMemo, useState } from "react";
import type { BondsYieldCurveResponse } from "@atlas-v1/shared";
import {
  FED_CURVE_DEFAULT_COMPARE_DAYS,
  normalizeFedCurveCompareDays,
  type FedCurveCompareDays,
} from "../../../lib/fedCurveComparePeriod";
import { fetchBondsYieldCurve } from "../../../services/api";
import { FedCurveCard } from "./FedCurveCard";
import { FedCurveDetailModal } from "./FedCurveDetailModal";
import { valuesByTenors } from "./fedCurveChartUtils";
import "./fed-curve-widget.css";

const POLL_MS = 5 * 60 * 1000;

type Props = {
  dragHandleClassName?: string;
  compareDays?: number;
  onCompareDaysChange?: (days: FedCurveCompareDays) => void;
  onDeleteWidget?: () => void;
};

export function FedCurveWidget({
  dragHandleClassName,
  compareDays: compareDaysProp,
  onCompareDaysChange,
  onDeleteWidget,
}: Props) {
  const compareDays = normalizeFedCurveCompareDays(compareDaysProp ?? FED_CURVE_DEFAULT_COMPARE_DAYS);
  const [data, setData] = useState<BondsYieldCurveResponse | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
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
  }, [compareDays]);

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
      <FedCurveDetailModal open={detailOpen} onClose={() => setDetailOpen(false)} compareDays={compareDays} />
    </>
  );
}
