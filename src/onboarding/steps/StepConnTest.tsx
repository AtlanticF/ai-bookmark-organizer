import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { storageGet } from "@/shared/lib/storage";
import { testConnection } from "@/shared/lib/api-client";

interface Props {
  onSuccess: () => void;
  onBack: () => void;
}

export default function StepConnTest({ onSuccess, onBack }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"testing" | "success" | "error">("testing");
  const [errorMsg, setErrorMsg] = useState("");

  async function runTest() {
    setStatus("testing");
    setErrorMsg("");
    try {
      const config = await storageGet("api_config");
      if (!config) {
        setStatus("error");
        setErrorMsg("API not configured");
        return;
      }
      const success = await testConnection(config);
      if (success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMsg("Connection refused");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }

  useEffect(() => {
    runTest();
  }, []);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">
        {t("onboarding.step2.title")}
      </h2>

      <div className="py-8 text-center">
        {status === "testing" && (
          <div>
            <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">
              {t("onboarding.step2.description")}
            </p>
          </div>
        )}

        {status === "success" && (
          <div>
            <div className="text-4xl mb-3" data-testid="success-icon">
              ✓
            </div>
            <p className="text-sm text-green-700 font-medium">
              {t("onboarding.step2.success")}
            </p>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="text-4xl mb-3 text-destructive">✗</div>
            <p className="text-sm text-destructive font-medium mb-3">
              {t("onboarding.step2.failed")}
            </p>
            {errorMsg && (
              <p className="text-xs text-muted-foreground mb-3">{errorMsg}</p>
            )}
            <button
              type="button"
              onClick={runTest}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t("common.retry")}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-3 justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {t("common.back")}
        </button>

        <button
          type="button"
          onClick={onSuccess}
          disabled={status !== "success"}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}
