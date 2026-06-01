/** Точка каретки / конца текста в поле (для «взгляда» логотипа). */
export function getInputCaretClientPoint(input: HTMLInputElement): { x: number; y: number } {
  const rect = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  const padL = Number.parseFloat(style.paddingLeft) || 0;
  const padR = Number.parseFloat(style.paddingRight) || 0;
  const pos = input.selectionStart ?? input.value.length;
  const textBefore = input.value.slice(0, pos);
  const text =
    input.type === "password" ? "•".repeat(textBefore.length) : textBefore;

  const textW = measureTextWidth(text, style);
  const innerW = Math.max(0, rect.width - padL - padR);
  const x = rect.left + padL + Math.min(textW, innerW);
  const y = rect.top + rect.height / 2;
  return { x, y };
}

function measureTextWidth(text: string, style: CSSStyleDeclaration): number {
  if (!text) return 0;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const weight = style.fontWeight || "400";
    const size = style.fontSize || "16px";
    const family = style.fontFamily || "sans-serif";
    ctx.font = `${style.fontStyle || "normal"} ${weight} ${size} ${family}`;
    return ctx.measureText(text).width;
  }

  const mirror = document.createElement("span");
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.cssText = [
    "position:fixed",
    "visibility:hidden",
    "white-space:pre",
    "pointer-events:none",
    `font-family:${style.fontFamily}`,
    `font-size:${style.fontSize}`,
    `font-weight:${style.fontWeight}`,
    `font-style:${style.fontStyle}`,
    `letter-spacing:${style.letterSpacing}`,
    `text-transform:${style.textTransform}`,
  ].join(";");
  mirror.textContent = text;
  document.body.appendChild(mirror);
  const w = mirror.getBoundingClientRect().width;
  mirror.remove();
  return w;
}

export function isAuthTrackableInput(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  const t = el.type;
  if (t === "hidden" || t === "button" || t === "submit" || t === "checkbox" || t === "radio") {
    return false;
  }
  return true;
}
