import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  dashboardWidgetOuterSize,
  type DashboardWidgetType,
} from "../../lib/dashboardWidgets";

type Props = {
  widgetType: DashboardWidgetType;
  children: ReactNode;
};

/** Вписывает виджет в рамку превью: 1:1 если влезает, иначе scale вниз. */
export function WidgetGalleryScaledFrame({ widgetType, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const { w: naturalW, h: naturalH } = dashboardWidgetOuterSize(widgetType, 1280);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let rafId = 0;
    const measure = () => {
      const cw = host.clientWidth;
      const ch = host.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const next = Math.min(cw / naturalW, ch / naturalH, 1);
      setScale((prev) => (Math.abs(prev - next) < 0.0001 ? prev : next));
    };

    const schedule = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        measure();
      });
    };

    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    window.addEventListener("resize", schedule);

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [naturalW, naturalH]);

  const stageW = naturalW * scale;
  const stageH = naturalH * scale;

  return (
    <div ref={hostRef} className="widget-gallery-live-host">
      <div className="widget-gallery-live-stage" style={{ width: stageW, height: stageH }}>
        <div
          className="widget-gallery-live-inner"
          style={{
            width: naturalW,
            height: naturalH,
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
