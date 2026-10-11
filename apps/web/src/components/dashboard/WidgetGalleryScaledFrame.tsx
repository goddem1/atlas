import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  dashboardWidgetGalleryOuterSize,
  type DashboardWidgetType,
} from "../../lib/dashboardWidgets";

type Props = {
  widgetType: DashboardWidgetType;
  children: ReactNode;
};

/**
 * Рендерит виджет в каноническом размере и равномерно scale'ит под ширину хоста,
 * сохраняя реальные пропорции.
 *
 * Виджеты «на всю колонку» (≥280px) растягиваются/сжимаются до ширины карточки,
 * чтобы в мобильной галерее края совпадали. Компактные (index и т.п.) только сжимаются.
 */
export function WidgetGalleryScaledFrame({ widgetType, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const { w: naturalW, h: naturalH } = dashboardWidgetGalleryOuterSize(widgetType);
  const fillHostWidth = naturalW >= 280;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let rafId = 0;
    const measure = () => {
      const cw = host.clientWidth;
      if (cw <= 0) return;
      const ratio = cw / naturalW;
      const next = fillHostWidth ? ratio : Math.min(ratio, 1);
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
  }, [naturalW, naturalH, fillHostWidth]);

  const stageH = Math.ceil(naturalH * scale) + 2;

  return (
    <div ref={hostRef} className="widget-gallery-live-host">
      <div
        className="widget-gallery-live-stage"
        style={
          fillHostWidth
            ? { width: "100%", height: stageH }
            : { width: Math.ceil(naturalW * scale) + 2, height: stageH }
        }
      >
        <div
          className="widget-gallery-live-inner"
          style={{
            width: naturalW,
            height: naturalH,
            transform: Math.abs(scale - 1) < 0.0001 ? undefined : `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
