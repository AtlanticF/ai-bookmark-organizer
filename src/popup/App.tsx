import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueueStatus } from "@/shared/hooks";
import { storageGet, onStorageChanged } from "@/shared/lib/storage";
import type { ApiConfig, ArchiveRecord } from "@/shared/types";

const MAX_RECENT = 5;

export default function App() {
  const { t } = useTranslation();
  const queueStatus = useQueueStatus();

  const [apiConfig, setApiConfig] = useState<ApiConfig | undefined>(undefined);
  const [history, setHistory] = useState<ArchiveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      storageGet("api_config"),
      storageGet("archive_history"),
    ]).then(([config, hist]) => {
      if (cancelled) return;
      setApiConfig(config);
      setHistory((hist ?? []).slice(0, MAX_RECENT));
      setLoading(false);
    });

    const unsubConfig = onStorageChanged("api_config", (newVal) => {
      if (!cancelled) setApiConfig(newVal);
    });

    const unsubHistory = onStorageChanged("archive_history", (newVal) => {
      if (!cancelled) setHistory((newVal ?? []).slice(0, MAX_RECENT));
    });

    return () => {
      cancelled = true;
      unsubConfig();
      unsubHistory();
    };
  }, []);

  if (loading) {
    return (
      <div className="w-80 p-4">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  const isConfigured = !!(apiConfig?.baseUrl && apiConfig?.apiKey);

  if (!isConfigured) {
    return (
      <div className="w-80 p-4">
        <h1 className="text-base font-semibold mb-3">AI Bookmark Organizer</h1>
        <div className="rounded-md border border-border p-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm text-muted-foreground">
              {t("popup.status.notConfigured")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => chrome.runtime.openOptionsPage()}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t("common.openSettings")}
          </button>
        </div>
      </div>
    );
  }

  const activeCount = queueStatus.pending + queueStatus.inProgress;
  const isProcessing = activeCount > 0;

  return (
    <div className="w-80 p-4">
      <h1 className="text-base font-semibold mb-3">AI Bookmark Organizer</h1>

      <div className="flex items-center gap-2 mb-4">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            isProcessing ? "bg-yellow-500 animate-pulse" : "bg-green-500"
          }`}
        />
        <span className="text-sm text-muted-foreground">
          {isProcessing
            ? t("popup.status.processing", {
                current: queueStatus.inProgress,
                total: activeCount,
              })
            : t("popup.status.idle")}
        </span>
      </div>

      <div className="mb-4">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          {t("popup.recentArchives")}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            {t("popup.noRecentArchives")}
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((record) => (
              <li
                key={`${record.bookmarkId}-${record.timestamp}`}
                className="rounded-md border border-border px-2.5 py-2"
              >
                <p className="text-sm font-medium text-foreground break-words">
                  {record.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 break-all">
                  {record.url}
                </p>
                <p className="text-xs text-primary mt-1">
                  {t("popup.archivedTo", { folder: record.toFolder })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={() => chrome.runtime.openOptionsPage()}
          className="flex-1 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
        >
          {t("common.openSettings")}
        </button>
        <button
          type="button"
          onClick={() =>
            chrome.tabs.create({ url: "chrome://bookmarks" })
          }
          className="flex-1 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
        >
          {t("common.openInbox")}
        </button>
      </div>
    </div>
  );
}
