import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiConfig } from "@/shared/hooks";

export default function App() {
  const { t } = useTranslation();
  const { config, saveConfig, loading } = useApiConfig();

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  if (!loading && !initialized) {
    setBaseUrl(config.baseUrl);
    setApiKey(config.apiKey);
    setModel(config.model);
    setInitialized(true);
  }

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!baseUrl.trim()) {
      errs.baseUrl = "API Base URL is required";
    } else {
      try {
        new URL(baseUrl);
      } catch {
        errs.baseUrl = "Invalid URL format";
      }
    }

    if (!apiKey.trim()) {
      errs.apiKey = "API Key is required";
    }

    if (!model.trim()) {
      errs.model = "Model is required";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    await saveConfig({
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    });

    showToast("success", t("options.saved"));
  }

  async function handleTestConnection() {
    if (!validate()) return;

    setTesting(true);
    try {
      await saveConfig({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
      });

      const result = await chrome.runtime.sendMessage({
        type: "TEST_API_CONNECTION",
      });

      if (result?.success) {
        showToast("success", t("options.testSuccess"));
      } else {
        showToast("error", t("options.testFailed", { error: "Connection refused" }));
      }
    } catch (err) {
      showToast(
        "error",
        t("options.testFailed", {
          error: err instanceof Error ? err.message : "Unknown error",
        }),
      );
    } finally {
      setTesting(false);
    }
  }

  function handleRerunArchive() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/onboarding/index.html"),
    });
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">{t("options.title")}</h1>

      {toast && (
        <div
          role="alert"
          className={`mb-4 px-4 py-3 rounded-md text-sm ${
            toast.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label htmlFor="baseUrl" className="block text-sm font-medium mb-1">
            {t("options.apiBaseUrl")}
          </label>
          <input
            id="baseUrl"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={t("options.apiBaseUrlPlaceholder")}
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {errors.baseUrl && (
            <p className="text-destructive text-xs mt-1">{errors.baseUrl}</p>
          )}
        </div>

        <div>
          <label htmlFor="apiKey" className="block text-sm font-medium mb-1">
            {t("options.apiKey")}
          </label>
          <div className="relative">
            <input
              id="apiKey"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t("options.apiKeyPlaceholder")}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-16"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          {errors.apiKey && (
            <p className="text-destructive text-xs mt-1">{errors.apiKey}</p>
          )}
        </div>

        <div>
          <label htmlFor="model" className="block text-sm font-medium mb-1">
            {t("options.model")}
          </label>
          <input
            id="model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t("options.modelPlaceholder")}
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {errors.model && (
            <p className="text-destructive text-xs mt-1">{errors.model}</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t("common.save")}
          </button>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {testing ? t("common.loading") : t("options.testConnection")}
          </button>
        </div>
      </form>

      <hr className="my-8 border-border" />

      <button
        type="button"
        onClick={handleRerunArchive}
        className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
      >
        {t("options.rerunArchive")}
      </button>
    </div>
  );
}
