import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

export type Locale = "en" | "zh-CN";

const messages: Record<Locale, typeof en> = {
  en,
  "zh-CN": zhCN,
};

type Messages = typeof en;

const I18nContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
} | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof navigator === "undefined") return "en";
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith("zh")) return "zh-CN";
    return "en";
  });

  const t = useMemo(() => messages[locale], [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, t]
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
