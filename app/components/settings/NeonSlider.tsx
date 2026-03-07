import { cn } from "~/lib/utils/cn";

interface NeonSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  label: string;
  displayValue?: string;
  className?: string;
}

export function NeonSlider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  displayValue,
  className,
}: NeonSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex justify-between items-baseline">
        <label className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-secondary">
          {label}
        </label>
        <span className="text-xs font-mono text-gold-pure">
          {displayValue ?? value.toFixed(1)}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-deep-space border border-border-subtle overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gold-pure/30 transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={cn(
            "absolute inset-0 w-full h-full opacity-0 cursor-pointer",
            "[&::-webkit-slider-thumb]:appearance-none",
          )}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gold-pure border border-gold-pure/50"
          style={{
            left: `calc(${pct}% - 6px)`,
            boxShadow: "0 0 12px rgba(255, 215, 0, 0.5)",
          }}
        />
      </div>
    </div>
  );
}
