import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ApiConfig } from "@/shared/types";

const API_PRESETS = [
  { label: "OpenAI", url: "https://api.openai.com/v1" },
  { label: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai" },
] as const;

const MODEL_PRESETS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gemini-2.5-flash",
  "gemini-flash-lite-lates",
] as const;

export interface ApiConfigFormProps {
  initialConfig: ApiConfig;
  onSave: (config: ApiConfig) => Promise<void>;
  showTestButton?: boolean;
  onTest?: (config: ApiConfig) => Promise<void>;
  testing?: boolean;
  submitLabel?: string;
}

export function ApiConfigForm({
  initialConfig,
  onSave,
  showTestButton = false,
  onTest,
  testing = false,
  submitLabel,
}: ApiConfigFormProps) {
  const { t } = useTranslation();

  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl);
  const [apiKey, setApiKey] = useState(initialConfig.apiKey);
  const [model, setModel] = useState(initialConfig.model);
  const [showKey, setShowKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): ApiConfig | null {
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
    if (Object.keys(errs).length > 0) return null;

    return {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const config = validate();
    if (!config) return;
    await onSave(config);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {API_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setBaseUrl(preset.url)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                baseUrl === preset.url
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border hover:border-primary/50"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
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
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {MODEL_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModel(m)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                model === m
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border hover:border-primary/50"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {errors.model && (
          <p className="text-destructive text-xs mt-1">{errors.model}</p>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {submitLabel ?? t("common.save")}
        </button>

        {showTestButton && onTest && (
          <button
            type="button"
            onClick={() => {
              const config = validate();
              if (config) onTest(config);
            }}
            disabled={testing}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {testing ? t("common.loading") : t("options.testConnection")}
          </button>
        )}
      </div>
    </form>
  );
}
