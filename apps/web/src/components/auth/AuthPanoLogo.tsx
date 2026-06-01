import { useEffect, useRef, useState, type RefObject } from "react";
import { getInputCaretClientPoint, isAuthTrackableInput } from "./authCaretPoint";
import { PanoLogoMark } from "./PanoLogoMark";

/** >1 — глаз сильнее реагирует на то же смещение курсора / каретки. */
const GAZE_SENSITIVITY = 1.55;
/** Доля ширины экрана от центра до max-поворота (0.25 = половина экрана суммарно). */
const HORIZONTAL_GAZE_HALF_RANGE = 0.25;
const MAX_TILT_X = 28;
const MAX_TILT_Y = 34;
const MAX_ROLL_Z = 11;
const LERP = 0.32;

type Gaze3d = { rotateX: number; rotateY: number; rotateZ: number };

type Props = {
  /** Контейнер модалки: поля ввода внутри переключают «взгляд» на каретку. */
  watchRootRef?: RefObject<HTMLElement | null>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function gazeTransform({ rotateX, rotateY, rotateZ }: Gaze3d): string {
  return `rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
}

function viewportWidth(): number {
  return window.innerWidth || document.documentElement.clientWidth || 1;
}

function viewportHeight(): number {
  return window.innerHeight || document.documentElement.clientHeight || 1;
}

/** Горизонталь: max-поворот на ±25% ширины от центра экрана (половина экрана), не у краёв. */
function gazeNxFromClientX(clientX: number): number {
  const w = viewportWidth();
  const cx = w / 2;
  const halfRange = w * HORIZONTAL_GAZE_HALF_RANGE;
  return clamp(((clientX - cx) / halfRange) * GAZE_SENSITIVITY, -1, 1);
}

/** Вертикаль: ноль в центре иконки глаза; выше — вверх, ниже — вниз. */
function gazeNyFromClientY(clientY: number, pivotEl: HTMLElement): number {
  const rect = pivotEl.getBoundingClientRect();
  const cy = rect.top + rect.height / 2;
  const refHalf = viewportHeight() / 2;
  return clamp(((clientY - cy) / refHalf) * GAZE_SENSITIVITY, -1, 1);
}

function gazeFromScreenPoint(
  pivotEl: HTMLElement,
  clientX: number,
  clientY: number,
): Gaze3d {
  const nx = gazeNxFromClientX(clientX);
  const ny = gazeNyFromClientY(clientY, pivotEl);
  return {
    rotateY: nx * MAX_TILT_Y,
    rotateX: -ny * MAX_TILT_X,
    rotateZ: nx * ny * MAX_ROLL_Z,
  };
}

function isPointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Точка взгляда: каретка по X; Y — от мыши, если курсор над полем (без рывка при фокусе). */
function gazeTargetForInput(
  input: HTMLInputElement,
  pivotEl: HTMLElement,
  mouse: { x: number; y: number } | null,
): Gaze3d {
  const caret = getInputCaretClientPoint(input);
  let x = caret.x;
  let y = caret.y;

  if (mouse) {
    const rect = input.getBoundingClientRect();
    if (isPointInRect(mouse.x, mouse.y, rect)) {
      y = mouse.y;
      const atStart = (input.selectionStart ?? 0) === 0 && input.value.length === 0;
      if (atStart) x = mouse.x;
    }
  }

  return gazeFromScreenPoint(pivotEl, x, y);
}

/** Логотип над окном входа: 3D-наклон к курсору или к каретке в активном поле. */
export function AuthPanoLogo({ watchRootRef }: Props) {
  const pivotRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<Gaze3d>({ rotateX: 0, rotateY: 0, rotateZ: 0 });
  const currentRef = useRef<Gaze3d>({ rotateX: 0, rotateY: 0, rotateZ: 0 });
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const focusedInputRef = useRef<HTMLInputElement | null>(null);
  const [transform, setTransform] = useState(gazeTransform(currentRef.current));

  useEffect(() => {
    const root = watchRootRef?.current;
    if (!root) return;

    const onFocusIn = (e: FocusEvent) => {
      if (!isAuthTrackableInput(e.target)) return;
      focusedInputRef.current = e.target;
    };

    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (isAuthTrackableInput(next) && root.contains(next)) return;
      focusedInputRef.current = null;
    };

    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      focusedInputRef.current = null;
    };
  }, [watchRootRef]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    let frame = 0;
    const tick = () => {
      const pivot = pivotRef.current;
      if (pivot) {
        const input = focusedInputRef.current;

        if (input && document.activeElement === input && watchRootRef?.current?.contains(input)) {
          targetRef.current = gazeTargetForInput(input, pivot, mouseRef.current);
        } else if (mouseRef.current) {
          targetRef.current = gazeFromScreenPoint(
            pivot,
            mouseRef.current.x,
            mouseRef.current.y,
          );
        } else {
          targetRef.current = { rotateX: 0, rotateY: 0, rotateZ: 0 };
        }
      }

      const t = targetRef.current;
      const c = currentRef.current;
      c.rotateX += (t.rotateX - c.rotateX) * LERP;
      c.rotateY += (t.rotateY - c.rotateY) * LERP;
      c.rotateZ += (t.rotateZ - c.rotateZ) * LERP;
      setTransform(gazeTransform(c));
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [watchRootRef]);

  return (
    <div className="auth-pano-logo" aria-hidden>
      <div ref={pivotRef} className="auth-pano-logo-pivot" style={{ transform }}>
        <PanoLogoMark />
      </div>
    </div>
  );
}
