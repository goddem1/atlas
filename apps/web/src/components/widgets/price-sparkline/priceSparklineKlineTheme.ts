import type {
  CandleTooltipCustomCallback,
  DeepPartial,
  Styles,
  TooltipLegend,
} from "klinecharts";
import { TooltipIconPosition, TooltipShowType } from "klinecharts";

const INDICATOR_TOOLTIP_ICON_FONT = "icomoon";
const INDICATOR_TOOLTIP_ICONS = {
  visible: "\ue903",
  invisible: "\ue901",
  setting: "\ue902",
  close: "\ue900",
} as const;

function buildIndicatorTooltipIcon(
  id: keyof typeof INDICATOR_TOOLTIP_ICONS,
  color: string,
  marginLeft: number,
  hoverBg: string,
) {
  // Высота строки = 20 (как у текста: marginTop 4 + size 12 + marginBottom 4).
  // Центр глифа: marginTop 2 + paddingTop 2 + size/2 6 = 10 — совпадает с центром текста.
  return {
    id,
    position: TooltipIconPosition.Middle,
    marginLeft,
    marginTop: 2,
    marginRight: 1,
    marginBottom: 2,
    paddingLeft: 2,
    paddingTop: 2,
    paddingRight: 2,
    paddingBottom: 2,
    icon: INDICATOR_TOOLTIP_ICONS[id],
    fontFamily: INDICATOR_TOOLTIP_ICON_FONT,
    size: 12,
    color,
    activeColor: color,
    backgroundColor: "transparent",
    activeBackgroundColor: hoverBg,
  };
}

function buildIndicatorTooltipIcons(color: string, hoverBg: string) {
  return [
    buildIndicatorTooltipIcon("visible", color, 2, hoverBg),
    buildIndicatorTooltipIcon("invisible", color, 2, hoverBg),
    buildIndicatorTooltipIcon("setting", color, 1, hoverBg),
    buildIndicatorTooltipIcon("close", color, 1, hoverBg),
  ];
}

function formatChangePercent(changePct: number): string {
  if (!Number.isFinite(changePct)) return "—";
  const abs = Math.abs(changePct).toFixed(2);
  if (changePct > 0) return `+${abs}%`;
  if (changePct < 0) return `-${abs}%`;
  return `${abs}%`;
}

/** TV-like: ОТКР/МАКС/МИН/ЗАКР + изменение % в одной горизонтальной строке. */
function buildCandleTooltipCustom(labelColor: string): CandleTooltipCustomCallback {
  return (data, styles) => {
    const { current, prev } = data;
    const prevClose = prev?.close ?? current.close;
    const changeValue = current.close - prevClose;
    const changePct = prevClose === 0 ? Number.NaN : (changeValue / prevClose) * 100;

    const dirColor =
      current.close === current.open
        ? styles.bar.noChangeColor
        : current.close > current.open
          ? styles.bar.upColor
          : styles.bar.downColor;

    const changeColor =
      changeValue === 0
        ? styles.priceMark.last.noChangeColor
        : changeValue > 0
          ? styles.priceMark.last.upColor
          : styles.priceMark.last.downColor;

    const field = (label: string, tpl: string): TooltipLegend => ({
      // Трейлинг-пробел: подпись плотно к числу, дальше отступ marginRight
      title: { text: `${label} `, color: labelColor },
      value: { text: tpl, color: dirColor },
    });

    return [
      field("ОТКР", "{open}"),
      field("МАКС", "{high}"),
      field("МИН", "{low}"),
      field("ЗАКР", "{close}"),
      {
        title: { text: "", color: labelColor },
        value: { text: formatChangePercent(changePct), color: changeColor },
      },
    ];
  };
}

export function buildKlineChartStyles(dark: boolean): DeepPartial<Styles> {
  const gridColor = dark ? "rgba(255,255,255,0.08)" : "#EDEDED";
  const axisText = dark ? "rgba(255,255,255,0.55)" : "#76808F";
  const axisLine = dark ? "rgba(255,255,255,0.2)" : "#888888";
  const tooltipBg = dark ? "rgba(28,28,30,0.96)" : "#FEFEFE";
  const tooltipBorder = dark ? "rgba(255,255,255,0.12)" : "#f2f3f5";
  const tooltipLabel = dark ? "rgba(255,255,255,0.55)" : "#76808F";
  const tooltipValue = dark ? "rgba(255,255,255,0.92)" : "#051441";
  const indicatorIconHoverBg = dark ? "rgba(255,255,255,0.08)" : "rgba(19,23,34,0.06)";

  return {
    grid: {
      horizontal: { color: gridColor },
      vertical: { color: gridColor },
    },
    candle: {
      tooltip: {
        showType: TooltipShowType.Standard,
        rect: {
          color: tooltipBg,
          borderColor: tooltipBorder,
        },
        custom: buildCandleTooltipCustom(tooltipLabel),
        text: {
          color: tooltipValue,
          size: 12,
          marginLeft: 0,
          marginRight: 10,
          marginTop: 2,
          marginBottom: 2,
        },
      },
    },
    indicator: {
      tooltip: {
        text: {
          color: tooltipValue,
          size: 12,
          marginLeft: 8,
          marginRight: 4,
          marginTop: 4,
          marginBottom: 4,
        },
        icons: buildIndicatorTooltipIcons(tooltipLabel, indicatorIconHoverBg),
      },
    },
    xAxis: {
      axisLine: { color: axisLine },
      tickLine: { color: axisLine },
      tickText: { color: axisText },
    },
    yAxis: {
      axisLine: { color: axisLine },
      tickLine: { color: axisLine },
      tickText: { color: axisText },
    },
    separator: {
      color: axisLine,
    },
    crosshair: {
      horizontal: {
        line: { color: axisLine },
        text: {
          backgroundColor: dark ? "#3a3a3c" : "#686D76",
          borderColor: dark ? "#3a3a3c" : "#686D76",
        },
      },
      vertical: {
        line: { color: axisLine },
        text: {
          backgroundColor: dark ? "#3a3a3c" : "#686D76",
          borderColor: dark ? "#3a3a3c" : "#686D76",
        },
      },
    },
  };
}
