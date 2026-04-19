import type { PortfolioTimeframe } from "@atlas-v1/shared";

type Option = { id: PortfolioTimeframe; label: string };

const OPTIONS: Option[] = [
  { id: "d", label: "Д" },
  { id: "m", label: "М" },
  { id: "y", label: "Г" },
  { id: "all", label: "Все" },
];

type Props = {
  value: PortfolioTimeframe;
  onChange: (next: PortfolioTimeframe) => void;
};

export function TimeframeSwitcher({ value, onChange }: Props) {
  return (
    <div className="portfolio-timeframe-switcher">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`portfolio-timeframe-button${
            value === option.id ? " portfolio-timeframe-button-active" : ""
          }`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
