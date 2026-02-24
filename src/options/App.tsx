import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiConfig } from "@/shared/hooks";
import { ApiConfigForm } from "@/shared/components/ApiConfigForm";
import type { ApiConfig } from "@/shared/types";
import { testConnection } from "@/shared/lib/api-client";

export default function App() {
  const { t } = useTranslation();
  const { config, saveConfig, loading } = useApiConfig();
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave(newConfig: ApiConfig) {
    await saveConfig(newConfig);
    showToast("success", t("options.saved"));
  }

  async function handleTestConnection(formConfig: ApiConfig) {
    setTesting(true);
    try {
      const success = await testConnection(formConfig);
      if (success) {
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

      <ApiConfigForm
        initialConfig={config}
        onSave={handleSave}
        showTestButton
        onTest={handleTestConnection}
        testing={testing}
      />

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
