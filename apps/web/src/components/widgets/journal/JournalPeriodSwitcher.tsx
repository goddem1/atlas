import type { TradePeriod } from "../../../services/api";

type Option = { id: TradePeriod; label: string };

const OPTIONS: Option[] = [
  { id: "day", label: "Д" },
  { id: "month", label: "М" },
  { id: "year", label: "Г" },
  { id: "all", label: "Все" },
];

type Props = {
  value: TradePeriod;
  onChange: (next: TradePeriod) => void;
  className?: string;
};

export function JournalPeriodSwitcher({ value, onChange, className }: Props) {
  return (
    <div className={`journal-period-switcher portfolio-timeframe-switcher${className ? ` ${className}` : ""}`}>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`btn-on-glass${value === option.id ? " portfolio-timeframe-button-active" : ""}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
