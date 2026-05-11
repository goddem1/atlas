/** Общие правила отображения макро-событий (модалка + виджет календаря). */

const MACRO_TEMP_ALERT_NAMES = new Set(
  [
    "unemployment rate",
    "u-6 unemployment rate",
    "average hourly earnings mom",
    "average hourly earnings yoy",
    "non farm payrolls",
    "average weekly hours",
    "participation rate",
    "manufacturing payrolls",
    "nonfarm payrolls private",
    "initial jobless claims",
    "continuing jobless claims",
    "jobless claims 4-week average",
    "inflation rate mom",
    "inflation rate yoy",
    "core inflation rate mom",
    "core inflation rate yoy",
    "core pce price index mom",
    "core pce price index yoy",
    "pce price index mom",
    "pce price index yoy",
    "ppi",
    "ppi mom",
    "ppi yoy",
    "core ppi mom",
    "core ppi yoy",
    "export prices mom",
    "export prices yoy",
    "import prices mom",
    "import prices yoy",
    "personal income",
    "personal income mom",
    "personal spending mom",
    "real personal spending mom",
    "industrial production mom",
    "industrial production yoy",
    "capacity utilization",
    "durable goods orders mom",
    "durable goods orders ex transp mom",
    "durable goods orders ex defense mom",
    "non defense goods orders ex air",
    "factory orders mom",
    "business inventories mom",
    "wholesale inventories mom",
    "retail sales mom",
    "retail sales control group mom",
    "retail sales ex autos mom",
    "retail sales yoy",
    "retail sales ex gas/autos mom",
    "retail inventories ex autos mom",
    "housing starts",
    "housing starts mom",
    "building permits prel",
    "building permits mom prel",
    "house price index",
    "house price index mom",
    "house price index yoy",
    "ny empire state manufacturing index",
    "ny fed services activity index",
    "ny fed bill purchases 1 to 4 months",
    "philly fed employment",
    "monthly budget statement",
    "adp employment change",
    "ism manufacturing employment",
    "ism manufacturing pmi",
    "ism services pmi",
    "ism manufacturing new orders",
    "ism manufacturing prices",
    "mba mortgage refinance index",
    "mba purchase index",
    "mba mortgage market index",
    "eia gasoline stocks change",
    "eia gasoline production change",
    "eia crude oil imports change",
    "eia crude oil stocks change",
    "eia cushing crude oil stocks change",
    "eia heating oil stocks change",
    "eia distillate stocks change",
    "eia distillate fuel production change",
    "eia refinery crude runs change",
    "challenger job cuts",
    "exports",
    "imports",
    "eia natural gas stocks change",
    "goods trade balance",
    "chicago fed national activity index",
    "kansas fed manufacturing index",
    "kansas fed composite index",
    "dallas fed manufacturing index",
    "dallas fed services index",
    "dallas fed services revenues index",
    "money supply",
    "fed interest rate decision",
    "richmond fed manufacturing shipments index",
    "richmond fed manufacturing index",
    "richmond fed services revenues index",
    "mba mortgage applications",
    "mba 30-year mortgage rate",
    "30-year mortgage rate",
    "15-year mortgage rate",
    "baker hughes total rigs count",
    "baker hughes oil rig count",
    "fed balance sheet",
    "total vehicle sales",
    "government payrolls",
    "ism services prices",
    "ism services new orders",
    "ism services business activity",
    "ism services employment",
    "redbook yoy",
    "rcm/tipp economic optimism index",
    "used car prices mom",
    "used car prices yoy",
    "consumer inflation expectations",
    "consumer credit change",
    "api crude oil stock change",
    "cpi",
    "cpi s.a",
    "factory orders ex transportation",
    "nfib business optimism index",
    "nahb housing market index",
    "pending home sales mom",
    "overall net capital flows",
    "foreign bond investment",
    "net long-term tic flows",
    "philadelphia fed manufacturing index",
    "philly fed capex index",
    "philly fed prices paid",
    "philly fed new orders",
    "philly fed business conditions",
    "balance of trade",
    "ppi ex food, energy and trade mom",
    "ppi ex food, energy and trade yoy",
  ].map((s) => s.toLowerCase()),
);

export function hasTempAlertMark(name: string): boolean {
  return MACRO_TEMP_ALERT_NAMES.has(name.trim().toLowerCase());
}

export function isMbaMortgageApplications(name: string): boolean {
  return name.trim().toLowerCase() === "mba mortgage applications";
}

/** Классы для модалки макро-событий (macro-events-modal.css). */
export function tempAlertMarkClassNameModal(name: string): string {
  return isMbaMortgageApplications(name)
    ? "macro-events-name-alert macro-events-name-alert--green"
    : "macro-events-name-alert";
}

/** Классы для виджета календаря (macro-calendar-widget.css). */
export function tempAlertMarkClassNameCalendar(name: string): string {
  return isMbaMortgageApplications(name)
    ? "macro-cal-alert macro-cal-alert--mba"
    : "macro-cal-alert";
}

export function isNoValuesIndicator(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    isSpeechIndicator(name) ||
    normalized === "fomc minutes" ||
    normalized === "wasde report" ||
    normalized === "nopa crush report" ||
    normalized === "fed beige book" ||
    normalized === "fed chair nominee kevin warsh confirmation hearing"
  );
}

export function isSpeechIndicator(name: string): boolean {
  return name.trim().toLowerCase().endsWith(" speech");
}

export function isActualOnlyIndicator(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === "ny fed bill purchases 1 to 4 months";
}

export function withMacroUnit(value: string | null, unit: string): string {
  if (!value) return "—";
  const raw = value.trim();
  const suffix = unit?.trim() ?? "";
  if (suffix === "$B") {
    const sign = raw.startsWith("-") ? "-" : raw.startsWith("+") ? "+" : "";
    const abs = sign ? raw.slice(1) : raw;
    return `${sign}$${abs}B`;
  }
  return suffix ? `${value}${suffix}` : value;
}

export function fmtMacroEventTime(dIso: string): string {
  const d = new Date(dIso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
}

function capFirst(s: string): string {
  if (!s) return s;
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

/** Заголовок дня для шапки (как в модалке календаря). */
export function formatMacroRussianDayTitle(d: Date): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekday = capFirst(get("weekday"));
  const day = get("day");
  const month = capFirst(get("month"));
  const year = get("year");
  return `${weekday}, ${day} ${month} ${year}`;
}

export function ymdMskFromDate(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}

export function eventYmdMsk(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}
