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
 * Рендерит виджет в каноническом размере и равномерно вписывает его
 * в блок превью целиком — и по ширине, и по высоте.
 */
export function WidgetGalleryScaledFrame({ widgetType, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const { w: naturalW, h: naturalH } = dashboardWidgetGalleryOuterSize(widgetType);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;

    let rafId = 0;
    const measure = () => {
      const child = inner.firstElementChild as HTMLElement | null;
      const boxW = Math.max(inner.offsetWidth, child?.offsetWidth ?? 0);
      const boxH = Math.max(inner.offsetHeight, child?.offsetHeight ?? 0);
      const hostW = host.clientWidth;
      const hostH = host.clientHeight;
      if (boxW <= 0 || boxH <= 0 || hostW <= 0 || hostH <= 0) return;

      const fit = Math.min(hostW / boxW, hostH / boxH, 1);
      setBox((prev) => (prev.w === boxW && prev.h === boxH ? prev : { w: boxW, h: boxH }));
      setScale((prev) => (Math.abs(prev - fit) < 0.0001 ? prev : fit));
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
    ro.observe(inner);
    window.addEventListener("resize", schedule);

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [naturalW, naturalH]);

  const boxW = box.w || naturalW;
  const boxH = box.h || naturalH;

  return (
    <div ref={hostRef} className="widget-gallery-live-host">
      <div
        className="widget-gallery-live-stage"
        style={{
          width: Math.ceil(boxW * scale),
          height: Math.ceil(boxH * scale),
        }}
      >
        <div
          ref={innerRef}
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
