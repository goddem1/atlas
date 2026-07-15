import {
  normalizeKlineOverlayLabelData,
  type KlineOverlayLabelData,
} from "@atlas-v1/shared";
import {
  registerOverlay,
  utils,
  type Coordinate,
  type OverlayCreateFiguresCallbackParams,
  type OverlayFigure,
  type OverlayTemplate,
} from "klinecharts";

const { formatFoldDecimal, formatThousands, formatPrecision, getLinearYFromCoordinates, isNumber, isValid } =
  utils;

const LABEL_SIDE_OFFSET = 8;

let registered = false;

export function getKlineOverlayLabelData(extendData: unknown): KlineOverlayLabelData | undefined {
  return normalizeKlineOverlayLabelData(extendData);
}

export function getKlineOverlayLabelText(extendData: unknown): string {
  return getKlineOverlayLabelData(extendData)?.text ?? "";
}

function formatAxisPriceText(
  value: number,
  params: OverlayCreateFiguresCallbackParams,
): string {
  const { precision, thousandsSeparator, decimalFoldThreshold, yAxis } = params;
  const digits =
    yAxis?.isInCandle() !== false ? precision.price : precision.excludePriceVolumeMax;
  return formatFoldDecimal(
    formatThousands(formatPrecision(value, digits), thousandsSeparator),
    decimalFoldThreshold,
  );
}

function createAlwaysOnYAxisFigures(params: OverlayCreateFiguresCallbackParams) {
  const { overlay, coordinates, bounding, yAxis } = params;
  if (!coordinates.length) return [];

  const isFromZero = yAxis?.isFromZero() ?? false;
  const textAlign = isFromZero ? "left" : "right";
  const x = isFromZero ? 0 : bounding.width;
  const figures: NonNullable<ReturnType<NonNullable<OverlayTemplate["createYAxisFigures"]>>> =
    [];

  for (let index = 0; index < coordinates.length; index += 1) {
    const point = overlay.points[index];
    const coordinate = coordinates[index];
    if (!coordinate || !point || !isNumber(point.value)) continue;

    const lineColor = overlay.styles?.line?.color;
    figures.push({
      type: "text",
      ignoreEvent: true,
      attrs: {
        x,
        y: coordinate.y,
        text: formatAxisPriceText(point.value, params),
        align: textAlign,
        baseline: "middle",
      },
      ...(typeof lineColor === "string" && lineColor.length > 0
        ? {
            styles: {
              color: "#ffffff",
              backgroundColor: lineColor,
              borderColor: lineColor,
            },
          }
        : {}),
    });
  }

  return figures;
}

function isMostlyVerticalLine(start: Coordinate, end: Coordinate): boolean {
  return Math.abs(end.x - start.x) < Math.abs(end.y - start.y);
}

/** Для вертикали «начало» всегда у верхнего конца (меньший y). */
function orientLineEnds(start: Coordinate, end: Coordinate): [Coordinate, Coordinate] {
  if (!isMostlyVerticalLine(start, end)) return [start, end];
  return start.y <= end.y ? [start, end] : [end, start];
}

function resolveLabelAnchor(
  rawStart: Coordinate,
  rawEnd: Coordinate,
  label: KlineOverlayLabelData,
): {
  x: number;
  y: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
} {
  const [start, end] = orientLineEnds(rawStart, rawEnd);
  const vertical = isMostlyVerticalLine(start, end);

  const t = label.along === "end" ? 1 : label.along === "center" ? 0.5 : 0;
  let x = start.x + (end.x - start.x) * t;
  let y = start.y + (end.y - start.y) * t;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  // Перпендикуляр к линии.
  let px = -dy / len;
  let py = dx / len;

  if (vertical) {
    // Для вертикали side top/bottom = слева/справа.
    if (px > 0) {
      px = -px;
      py = -py;
    }
  } else if (py > 0) {
    // Для горизонтали/наклона side top = визуально сверху (меньший y).
    px = -px;
    py = -py;
  }

  if (label.side === "top") {
    x += px * LABEL_SIDE_OFFSET;
    y += py * LABEL_SIDE_OFFSET;
  } else if (label.side === "bottom") {
    x -= px * LABEL_SIDE_OFFSET;
    y -= py * LABEL_SIDE_OFFSET;
  }

  let align: CanvasTextAlign = "center";
  let baseline: CanvasTextBaseline = "middle";

  if (vertical) {
    if (label.side === "top") align = "right";
    else if (label.side === "bottom") align = "left";
    else align = "center";

    if (label.along === "start") baseline = "top";
    else if (label.along === "end") baseline = "bottom";
    else baseline = "middle";
  } else {
    if (label.along === "start") align = "left";
    else if (label.along === "end") align = "right";
    else align = "center";

    if (label.side === "top") baseline = "bottom";
    else if (label.side === "bottom") baseline = "top";
    else baseline = "middle";
  }

  return { x, y, align, baseline };
}

function createOverlayLabelFigure(
  start: Coordinate,
  end: Coordinate,
  overlay: OverlayCreateFiguresCallbackParams["overlay"],
): OverlayFigure | null {
  const label = getKlineOverlayLabelData(overlay.extendData);
  if (!label) return null;

  const anchor = resolveLabelAnchor(start, end, label);
  const lineColor = overlay.styles?.line?.color;
  const size = label.size || 12;
  const padX = Math.max(4, Math.round(size * 0.5));
  const padY = Math.max(2, Math.round(size * 0.25));
  return {
    type: "text",
    ignoreEvent: true,
    attrs: {
      x: anchor.x,
      y: anchor.y,
      text: label.text,
      align: anchor.align,
      baseline: anchor.baseline,
    },
    styles: {
      size,
      paddingLeft: padX,
      paddingRight: padX,
      paddingTop: padY,
      paddingBottom: padY,
      borderRadius: Math.max(3, Math.round(size * 0.35)),
      color: "#ffffff",
      backgroundColor: typeof lineColor === "string" ? lineColor : "rgba(41, 98, 255, 0.92)",
      borderColor: typeof lineColor === "string" ? lineColor : "rgba(41, 98, 255, 0.92)",
    },
  };
}

function withOverlayLabel(
  figures: OverlayFigure[],
  lineStart: Coordinate,
  lineEnd: Coordinate,
  overlay: OverlayCreateFiguresCallbackParams["overlay"],
): OverlayFigure[] {
  const label = createOverlayLabelFigure(lineStart, lineEnd, overlay);
  if (!label) return figures;
  return [...figures, label];
}

function getRayLineAttrs(
  coordinates: Coordinate[],
  bounding: { width: number; height: number },
): { coordinates: Coordinate[] } | null {
  if (coordinates.length < 2) return null;
  const start = coordinates[0]!;
  const next = coordinates[1]!;
  let end: Coordinate;
  if (start.x === next.x && start.y !== next.y) {
    end = { x: start.x, y: start.y < next.y ? bounding.height : 0 };
  } else if (start.x > next.x) {
    end = {
      x: 0,
      y: getLinearYFromCoordinates(start, next, { x: 0, y: start.y }),
    };
  } else {
    end = {
      x: bounding.width,
      y: getLinearYFromCoordinates(start, next, { x: bounding.width, y: start.y }),
    };
  }
  return { coordinates: [start, end] };
}

/**
 * Built-in overlays: keep Y-axis price badges always visible and draw user labels
 * from overlay.extendData next to the line.
 */
export function ensureKlineHorizontalPriceTagsAlwaysVisible(): void {
  if (registered) return;
  registered = true;

  const sharedAxis = {
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: false,
    createYAxisFigures: createAlwaysOnYAxisFigures,
  } satisfies Partial<OverlayTemplate>;

  registerOverlay({
    name: "horizontalStraightLine",
    totalStep: 2,
    ...sharedAxis,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (!coordinates[0]) return [];
      const start = { x: 0, y: coordinates[0].y };
      const end = { x: bounding.width, y: coordinates[0].y };
      return withOverlayLabel(
        [{ type: "line", attrs: { coordinates: [start, end] } }],
        start,
        end,
        overlay,
      );
    },
  });

  registerOverlay({
    name: "horizontalRayLine",
    totalStep: 3,
    ...sharedAxis,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (!coordinates[0]) return [];
      const start = coordinates[0];
      const end = { x: 0, y: start.y };
      if (isValid(coordinates[1]) && start.x < coordinates[1]!.x) {
        end.x = bounding.width;
      }
      return withOverlayLabel(
        [{ type: "line", attrs: { coordinates: [start, end] } }],
        start,
        end,
        overlay,
      );
    },
    performEventPressedMove: ({ points, performPoint }) => {
      points[0]!.value = performPoint.value;
      if (points[1]) points[1].value = performPoint.value;
    },
    performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
      if (currentStep === 2) {
        points[0]!.value = performPoint.value;
      }
    },
  });

  registerOverlay({
    name: "horizontalSegment",
    totalStep: 3,
    ...sharedAxis,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length !== 2) return [];
      const start = coordinates[0]!;
      const end = coordinates[1]!;
      return withOverlayLabel(
        [{ type: "line", attrs: { coordinates: [start, end] } }],
        start,
        end,
        overlay,
      );
    },
    performEventPressedMove: ({ points, performPoint }) => {
      points[0]!.value = performPoint.value;
      if (points[1]) points[1].value = performPoint.value;
    },
    performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
      if (currentStep === 2) {
        points[0]!.value = performPoint.value;
      }
    },
  });

  registerOverlay({
    name: "priceLine",
    totalStep: 2,
    ...sharedAxis,
    createPointFigures: ({
      coordinates,
      bounding,
      precision,
      overlay,
      thousandsSeparator,
      decimalFoldThreshold,
      yAxis,
    }) => {
      if (!coordinates[0]) return [];
      const start = coordinates[0];
      const end = { x: bounding.width, y: start.y };
      const value = overlay.points[0]?.value ?? 0;
      const digits =
        yAxis?.isInCandle() !== false ? precision.price : precision.excludePriceVolumeMax;
      return withOverlayLabel(
        [
          {
            type: "line",
            attrs: { coordinates: [start, end] },
          },
          {
            type: "text",
            ignoreEvent: true,
            attrs: {
              x: start.x,
              y: start.y,
              text: formatFoldDecimal(
                formatThousands(value.toFixed(digits), thousandsSeparator),
                decimalFoldThreshold,
              ),
              baseline: "bottom",
            },
          },
        ],
        start,
        end,
        overlay,
      );
    },
  });

  const sharedLine = {
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
  } satisfies Partial<OverlayTemplate>;

  registerOverlay({
    name: "segment",
    totalStep: 3,
    ...sharedLine,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length !== 2) return [];
      return withOverlayLabel(
        [{ type: "line", attrs: { coordinates } }],
        coordinates[0]!,
        coordinates[1]!,
        overlay,
      );
    },
  });

  registerOverlay({
    name: "rayLine",
    totalStep: 3,
    ...sharedLine,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const attrs = getRayLineAttrs(coordinates, bounding);
      if (!attrs) return [];
      return withOverlayLabel(
        [{ type: "line", attrs }],
        attrs.coordinates[0]!,
        attrs.coordinates[1]!,
        overlay,
      );
    },
  });

  registerOverlay({
    name: "straightLine",
    totalStep: 3,
    ...sharedLine,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length !== 2) return [];
      const a = coordinates[0]!;
      const b = coordinates[1]!;
      if (a.x === b.x) {
        const start = { x: a.x, y: 0 };
        const end = { x: a.x, y: bounding.height };
        return withOverlayLabel(
          [{ type: "line", attrs: { coordinates: [start, end] } }],
          start,
          end,
          overlay,
        );
      }
      const start = { x: 0, y: getLinearYFromCoordinates(a, b, { x: 0, y: a.y }) };
      const end = {
        x: bounding.width,
        y: getLinearYFromCoordinates(a, b, { x: bounding.width, y: a.y }),
      };
      return withOverlayLabel(
        [{ type: "line", attrs: { coordinates: [start, end] } }],
        start,
        end,
        overlay,
      );
    },
  });

  registerOverlay({
    name: "verticalStraightLine",
    totalStep: 2,
    ...sharedLine,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (!coordinates[0]) return [];
      const start = { x: coordinates[0].x, y: 0 };
      const end = { x: coordinates[0].x, y: bounding.height };
      return withOverlayLabel(
        [{ type: "line", attrs: { coordinates: [start, end] } }],
        start,
        end,
        overlay,
      );
    },
  });

  registerOverlay({
    name: "verticalRayLine",
    totalStep: 3,
    ...sharedLine,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length !== 2) return [];
      const start = coordinates[0]!;
      const end = { x: start.x, y: 0 };
      if (start.y < coordinates[1]!.y) end.y = bounding.height;
      return withOverlayLabel(
        [{ type: "line", attrs: { coordinates: [start, end] } }],
        start,
        end,
        overlay,
      );
    },
    performEventPressedMove: ({ points, performPoint }) => {
      points[0]!.timestamp = performPoint.timestamp;
      points[0]!.dataIndex = performPoint.dataIndex;
      if (points[1]) {
        points[1].timestamp = performPoint.timestamp;
        points[1].dataIndex = performPoint.dataIndex;
      }
    },
    performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
      if (currentStep === 2) {
        points[0]!.timestamp = performPoint.timestamp;
        points[0]!.dataIndex = performPoint.dataIndex;
      }
    },
  });

  registerOverlay({
    name: "verticalSegment",
    totalStep: 3,
    ...sharedLine,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length !== 2) return [];
      return withOverlayLabel(
        [{ type: "line", attrs: { coordinates } }],
        coordinates[0]!,
        coordinates[1]!,
        overlay,
      );
    },
    performEventPressedMove: ({ points, performPoint }) => {
      points[0]!.timestamp = performPoint.timestamp;
      points[0]!.dataIndex = performPoint.dataIndex;
      if (points[1]) {
        points[1].timestamp = performPoint.timestamp;
        points[1].dataIndex = performPoint.dataIndex;
      }
    },
    performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
      if (currentStep === 2) {
        points[0]!.timestamp = performPoint.timestamp;
        points[0]!.dataIndex = performPoint.dataIndex;
      }
    },
  });
}
