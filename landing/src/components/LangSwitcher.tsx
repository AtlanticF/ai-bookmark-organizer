import { useI18n } from "../i18n";
import type { Locale } from "../i18n";

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "中文" },
];

export function LangSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1">
      {LOCALES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setLocale(value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-1 ${
            locale === value
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
