import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { cn } from "../../../../shared/utils";
import type { FilterState } from "../utils/filterApply";

interface FilterPanelProps {
  filters: FilterState;
  onChange: (key: string, value: number) => void;
  onReset: () => void;
}

interface SliderDef {
  key: keyof FilterState;
  labelKey: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  formatValue?: (v: number) => string;
}

const sliders: SliderDef[] = [
  { key: "brightness", labelKey: "filters.brightness", min: -255, max: 255, step: 1, defaultValue: 0 },
  { key: "contrast", labelKey: "filters.contrast", min: -100, max: 100, step: 1, defaultValue: 0 },
  {
    key: "saturation",
    labelKey: "filters.saturation",
    min: 0,
    max: 3,
    step: 0.01,
    defaultValue: 1,
    formatValue: (v) => v.toFixed(2),
  },
  { key: "blur", labelKey: "filters.blur", min: 0, max: 10, step: 0.1, defaultValue: 0, formatValue: (v) => v.toFixed(1) },
  { key: "sharpen", labelKey: "filters.sharpen", min: 0, max: 10, step: 0.1, defaultValue: 0, formatValue: (v) => v.toFixed(1) },
];

export default function FilterPanel({ filters, onChange, onReset }: FilterPanelProps) {
  const { t } = useTranslation("editor");
  const hasChanges = Object.keys(filters).some(
    (k) => filters[k as keyof FilterState] !== sliders.find((s) => s.key === k)?.defaultValue,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-400">{t("filters.title")}</span>
        <div className="flex-1 border-t border-zinc-800" />
      </div>

      {sliders.map((slider) => {
        const value = filters[slider.key];
        const displayValue = slider.formatValue ? slider.formatValue(value) : String(value);
        const isDefault = value === slider.defaultValue;

        return (
          <div key={slider.key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">{t(slider.labelKey)}</label>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  isDefault ? "text-zinc-600" : "text-violet-400",
                )}
              >
                {displayValue}
              </span>
            </div>
            <input
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={value}
              onChange={(e) => onChange(slider.key, Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-violet-500"
            />
          </div>
        );
      })}

      <button
        onClick={onReset}
        disabled={!hasChanges}
        className={cn(
          "mt-2 flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
          hasChanges
            ? "border-zinc-700 text-zinc-400 hover:border-violet-500 hover:text-violet-400"
            : "cursor-not-allowed border-zinc-800 text-zinc-700",
        )}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t("filters.reset")}
      </button>
    </div>
  );
}
