import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en.json";
import zhCN from "./zh-CN.json";

const resources = {
  en: { translation: en },
  "zh-CN": { translation: zhCN },
};

const chromeStorageDetector = {
  name: "chromeStorage",
  lookup(_options: Record<string, unknown>) {
    return undefined as string | undefined;
  },
  cacheUserLanguage() {},
};

const detector = new LanguageDetector();
detector.addDetector(chromeStorageDetector);

i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["chromeStorage", "navigator", "htmlTag"],
      caches: [],
    },
  });

if (typeof chrome !== "undefined" && chrome.storage?.local) {
  chrome.storage.local.get("language").then((result) => {
    const lang =
      typeof result?.language === "string" ? result.language : undefined;
    if (lang && lang !== i18n.language) {
      i18n.changeLanguage(lang);
    }
  }).catch(() => {});
}

export default i18n;
