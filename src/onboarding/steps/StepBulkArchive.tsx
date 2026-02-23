import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiConfig } from "@/shared/hooks";
import { flattenBookmarks, ensureFolderExists } from "@/shared/lib/bookmark-tree";
import {
  exportBookmarksAsHtml,
  downloadHtmlFile,
} from "@/shared/lib/bookmark-export";
import { generateFolderStructure } from "@/background/ai-classifier";
import { batchMoveBookmarks } from "@/background/bookmark-mover";
import type { ProposedFolder, BulkProgress } from "@/shared/types";
import type { BookmarkAssignment } from "@/background/bookmark-mover";

type SubPhase = "backup" | "analyzing" | "editing" | "executing" | "done";

interface Props {
  folderStructure: ProposedFolder[];
  setFolderStructure: (folders: ProposedFolder[]) => void;
  onComplete: () => Promise<void>;
  onBack: () => void;
}

export default function StepBulkArchive({
  folderStructure,
  setFolderStructure,
  onComplete,
  onBack,
}: Props) {
  const { t } = useTranslation();
  const { config } = useApiConfig();

  const [phase, setPhase] = useState<SubPhase>("backup");
  const [backupDone, setBackupDone] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [error, setError] = useState("");

  async function handleBackup() {
    const html = await exportBookmarksAsHtml();
    const date = new Date().toISOString().slice(0, 10);
    downloadHtmlFile(html, `bookmarks-backup-${date}.html`);
    setBackupDone(true);
  }

  async function handleGenerate() {
    setAnalyzing(true);
    setError("");
    setPhase("analyzing");
    try {
      const rawTree = await chrome.bookmarks.getTree();
      const bookmarks = flattenBookmarks(rawTree);
      const mapped = bookmarks.map((b) => ({
        title: b.title,
        url: b.url,
      }));
      const result = await generateFolderStructure(mapped, config);
      setFolderStructure(result.folders);
      setPhase("editing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPhase("backup");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleFolderRename(index: number, newName: string) {
    const updated = [...folderStructure];
    updated[index] = { ...updated[index]!, name: newName };
    setFolderStructure(updated);
  }

  function handleFolderDelete(index: number) {
    const folder = folderStructure[index];
    if (!folder) return;
    if (folder.name.startsWith("00_") || folder.name.startsWith("99_")) return;
    const updated = folderStructure.filter((_, i) => i !== index);
    setFolderStructure(updated);
  }

  function handleAddCategory() {
    const maxPrefix = Math.max(
      ...folderStructure.map((f) => {
        const match = f.name.match(/^(\d+)/);
        return match?.[1] ? parseInt(match[1], 10) : 0;
      }),
      0,
    );
    const newPrefix = String(Math.min(maxPrefix + 1, 98)).padStart(2, "0");
    setFolderStructure([
      ...folderStructure,
      {
        name: `${newPrefix}_📁_New Category`,
        description: "New category",
        children: [],
        estimated_count: 0,
      },
    ]);
  }

  async function handleExecute() {
    setPhase("executing");
    setError("");

    try {
      for (const folder of folderStructure) {
        await ensureFolderExists(folder.name);
        for (const child of folder.children) {
          await ensureFolderExists(`${folder.name}/${child.name}`);
        }
      }

      const rawTree = await chrome.bookmarks.getTree();
      const bookmarks = flattenBookmarks(rawTree);

      const inboxFolder = folderStructure.find((f) =>
        f.name.startsWith("00_"),
      );
      const inboxName = inboxFolder?.name ?? "00_📥_Inbox";

      const assignments: BookmarkAssignment[] = bookmarks.map((b) => ({
        bookmarkId: b.id,
        title: b.title,
        url: b.url,
        fromFolder: "current",
        targetFolderPath: inboxName,
        isNewFolder: false,
      }));

      const result = await batchMoveBookmarks(assignments);
      setProgress(result);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
      setPhase("editing");
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">
        {t("onboarding.step4.title")}
      </h2>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200" role="alert">
          {error}
        </div>
      )}

      {phase === "backup" && (
        <div className="py-6">
          <p className="text-sm text-muted-foreground mb-4">
            Before reorganizing, please download a backup of your current bookmarks.
          </p>
          <div className="flex gap-3 items-center mb-6">
            <button
              type="button"
              onClick={handleBackup}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t("onboarding.step4.backup")}
            </button>
            {backupDone && (
              <span className="text-sm text-green-700">
                ✓ {t("onboarding.step4.backupDone")}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={analyzing}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {t("onboarding.step4.generateStructure")}
          </button>
        </div>
      )}

      {phase === "analyzing" && (
        <div className="py-8 text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("onboarding.step4.generating")}
          </p>
        </div>
      )}

      {phase === "editing" && (
        <div className="py-4">
          <h3 className="text-sm font-medium mb-3">
            {t("onboarding.step4.folderEditor")}
          </h3>
          <ul className="space-y-2 mb-4">
            {folderStructure.map((folder, i) => {
              const isProtected =
                folder.name.startsWith("00_") ||
                folder.name.startsWith("99_");
              return (
                <li
                  key={`folder-${i}`}
                  className="flex items-center gap-2 p-2 border border-border rounded-md"
                >
                  <input
                    type="text"
                    value={folder.name}
                    onChange={(e) => handleFolderRename(i, e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-input rounded bg-background"
                    data-testid={`folder-name-${i}`}
                  />
                  <span className="text-xs text-muted-foreground w-20 truncate">
                    ~{folder.estimated_count}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleFolderDelete(i)}
                    disabled={isProtected}
                    className="text-xs text-destructive hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed px-2"
                    data-testid={`folder-delete-${i}`}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-3 justify-between">
            <button
              type="button"
              onClick={handleAddCategory}
              className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
            >
              + Add Category
            </button>
            <button
              type="button"
              onClick={handleExecute}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t("onboarding.step4.confirmExecute")}
            </button>
          </div>
        </div>
      )}

      {phase === "executing" && (
        <div className="py-8 text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("onboarding.step4.processing", {
              current: progress?.completed ?? 0,
              total: progress?.total ?? 0,
            })}
          </p>
        </div>
      )}

      {phase === "done" && progress && (
        <div className="py-8 text-center">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-lg font-medium mb-2">
            {t("onboarding.step4.complete")}
          </p>
          <p className="text-sm text-muted-foreground mb-1">
            {t("onboarding.step4.succeeded", { count: progress.completed })}
          </p>
          {progress.failed > 0 && (
            <p className="text-sm text-destructive">
              {t("onboarding.step4.failed", { count: progress.failed })}
            </p>
          )}
          <div className="mt-6">
            <button
              type="button"
              onClick={onComplete}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t("common.done")}
            </button>
          </div>
        </div>
      )}

      {(phase === "backup" || phase === "editing") && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t("common.back")}
          </button>
        </div>
      )}
    </div>
  );
}
