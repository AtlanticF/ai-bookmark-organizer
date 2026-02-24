import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { storageGet, onStorageChanged } from "@/shared/lib/storage";
import type { PendingBookmarkReview } from "@/shared/types";

export default function App() {
  const { t } = useTranslation();
  const [review, setReview] = useState<PendingBookmarkReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    storageGet("pending_bookmark_review").then((data) => {
      if (cancelled) return;
      setReview(data ?? null);
      setLoading(false);
    });

    const unsub = onStorageChanged("pending_bookmark_review", (newVal) => {
      if (!cancelled) {
        setReview(newVal ?? null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  async function handleDecision(decision: "keep" | "discard") {
    if (!review) return;
    setActing(true);
    try {
      await chrome.runtime.sendMessage({
        type: "REVIEW_DECISION",
        payload: { bookmarkId: review.bookmarkId, decision },
      });
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground mt-8">
          {t("sidepanel.noReview")}
        </p>
      </div>
    );
  }

  if (review.status === "decided") {
    return (
      <div className="p-4 text-center">
        <div className="text-4xl mb-3">✓</div>
        <p className="text-sm text-muted-foreground">
          {t("sidepanel.decided")}
        </p>
      </div>
    );
  }

  const isAnalyzing = review.status === "analyzing";
  const assessment = review.assessment;
  const hasDuplicates = review.duplicates.length > 0;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-base font-semibold">{t("sidepanel.title")}</h1>

      <div className="rounded-md border border-border p-3">
        <p className="text-sm font-medium truncate" title={review.title}>
          {review.title}
        </p>
        <p
          className="text-xs text-muted-foreground truncate mt-0.5"
          title={review.url}
        >
          {review.url}
        </p>
      </div>

      {isAnalyzing && (
        <div className="text-center py-6">
          <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-sm text-muted-foreground">
            {t("sidepanel.analyzing")}
          </p>
        </div>
      )}

      {!isAnalyzing && (
        <>
          <div className="rounded-md border border-border p-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              {hasDuplicates
                ? t("sidepanel.duplicateFound")
                : t("sidepanel.noDuplicate")}
            </h3>
            {hasDuplicates && (
              <ul className="space-y-1">
                {review.duplicates.map((dup) => (
                  <li
                    key={dup.id}
                    className="text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded truncate"
                    title={dup.url}
                  >
                    {dup.title}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {assessment && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("sidepanel.aiAssessment")}
              </h3>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    assessment.isWorthKeeping
                      ? "bg-green-500"
                      : "bg-orange-500"
                  }`}
                />
                <span className="text-sm font-medium">
                  {assessment.isWorthKeeping
                    ? t("sidepanel.worthKeeping")
                    : t("sidepanel.notWorthKeeping")}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {t("sidepanel.confidence")}:{" "}
                  {Math.round(assessment.confidence * 100)}%
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                <span className="font-medium">{t("sidepanel.reason")}:</span>{" "}
                {assessment.reason}
              </p>

              {assessment.suggestedFolder && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">
                    {t("sidepanel.suggestedFolder")}:
                  </span>{" "}
                  {assessment.suggestedFolder}
                </p>
              )}

              {assessment.similarExisting.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t("sidepanel.similarBookmarks")}:
                  </p>
                  <ul className="space-y-0.5">
                    {assessment.similarExisting.map((title, i) => (
                      <li
                        key={`similar-${i}`}
                        className="text-xs text-muted-foreground truncate pl-2 border-l-2 border-muted"
                      >
                        {title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!isAnalyzing && (
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => handleDecision("discard")}
            disabled={acting}
            className="flex-1 px-3 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {t("sidepanel.discard")}
          </button>
          <button
            type="button"
            onClick={() => handleDecision("keep")}
            disabled={acting}
            className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {t("sidepanel.keepAndClassify")}
          </button>
        </div>
      )}
    </div>
  );
}
