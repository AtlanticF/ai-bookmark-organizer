import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useApiConfig } from "@/shared/hooks";
import {
  flattenBookmarks,
  ensureFolderExists,
  getFullTree,
  findEmptyFolders,
  removeFolders,
  reorderAllFolders,
  sortFoldersByPrefix,
  findDuplicatePrefixFolders,
  mergeFoldersInto,
  type FlatBookmark,
} from "@/shared/lib/bookmark-tree";
import {
  exportBookmarksAsHtml,
  downloadHtmlFile,
} from "@/shared/lib/bookmark-export";
import {
  generateFolderStructure,
  batchClassifyBookmarks,
  pruneBookmarks,
  decideFolderMerge,
} from "@/background/ai-classifier";
import { moveBookmark } from "@/background/bookmark-mover";
import type {
  ProposedFolder,
  BulkClassifyProgress,
  EmptyFolder,
  PruneCandidate,
} from "@/shared/types";

const PRUNE_BATCH_SIZE = 100;
const CLASSIFY_BATCH_SIZE = 50;
const CONCURRENT_BATCHES = 3;

type SubPhase =
  | "backup"
  | "pruning_analyze"
  | "pruning_review"
  | "analyzing"
  | "editing"
  | "executing"
  | "classifying"
  | "cleanup"
  | "done";

interface Props {
  folderStructure: ProposedFolder[];
  setFolderStructure: (folders: ProposedFolder[]) => void;
  onComplete: () => Promise<void>;
  onBack: () => void;
}

const CATEGORY_COLORS: Record<PruneCandidate["category"], string> = {
  duplicate: "bg-orange-100 text-orange-700",
  outdated: "bg-gray-100 text-gray-700",
  low_value: "bg-yellow-100 text-yellow-700",
  broken: "bg-red-100 text-red-700",
};

export default function StepBulkArchive({
  folderStructure,
  setFolderStructure,
  onComplete,
  onBack,
}: Props) {
  const { t, i18n } = useTranslation();
  const { config } = useApiConfig();
  const locale = i18n.language;

  const [phase, setPhase] = useState<SubPhase>("backup");
  const [backupDone, setBackupDone] = useState(false);
  const [classifyProgress, setClassifyProgress] =
    useState<BulkClassifyProgress | null>(null);
  const [pruneBatchProgress, setPruneBatchProgress] = useState({ current: 0, total: 0 });
  const [pruneCandidates, setPruneCandidates] = useState<PruneCandidate[]>([]);
  const [selectedPrune, setSelectedPrune] = useState<Set<string>>(new Set());
  const [emptyFolders, setEmptyFolders] = useState<EmptyFolder[]>([]);
  const [selectedForCleanup, setSelectedForCleanup] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState("");

  const remainingBookmarksRef = useRef<FlatBookmark[]>([]);

  async function handleBackup() {
    const html = await exportBookmarksAsHtml();
    const date = new Date().toISOString().slice(0, 10);
    downloadHtmlFile(html, `bookmarks-backup-${date}.html`);
    setBackupDone(true);
  }

  async function handleStartPrune() {
    setError("");
    setPhase("pruning_analyze");

    try {
      const rawTree = await chrome.bookmarks.getTree();
      const bookmarks = flattenBookmarks(rawTree);
      remainingBookmarksRef.current = bookmarks;

      const mapped = bookmarks.map((b) => ({ title: b.title, url: b.url }));
      const totalBatches = Math.ceil(mapped.length / PRUNE_BATCH_SIZE);
      setPruneBatchProgress({ current: 0, total: totalBatches });

      const allCandidates: PruneCandidate[] = [];
      let pruneDone = 0;

      const pruneBatches: { title: string; url: string }[][] = [];
      for (let i = 0; i < mapped.length; i += PRUNE_BATCH_SIZE) {
        pruneBatches.push(mapped.slice(i, i + PRUNE_BATCH_SIZE));
      }

      await runConcurrent(
        pruneBatches,
        async (batch) => {
          const candidates = await pruneBookmarks(batch, config, locale);
          allCandidates.push(...candidates);
          pruneDone++;
          setPruneBatchProgress({ current: pruneDone, total: totalBatches });
        },
        CONCURRENT_BATCHES,
      );

      setPruneCandidates(allCandidates);
      setSelectedPrune(new Set(allCandidates.map((c) => c.url)));
      setPhase("pruning_review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPhase("backup");
    }
  }

  async function handlePruneConfirm() {
    const urlsToRemove = selectedPrune;

    if (urlsToRemove.size > 0) {
      const bookmarks = remainingBookmarksRef.current;
      for (const bm of bookmarks) {
        if (urlsToRemove.has(bm.url)) {
          try {
            await chrome.bookmarks.remove(bm.id);
          } catch {
            // already gone
          }
        }
      }
      remainingBookmarksRef.current = bookmarks.filter(
        (b) => !urlsToRemove.has(b.url),
      );
    }

    await handleGenerate();
  }

  async function handlePruneSkip() {
    await handleGenerate();
  }

  async function handleGenerate() {
    setError("");
    setPhase("analyzing");
    try {
      const rawTree = await chrome.bookmarks.getTree();
      const bookmarks = flattenBookmarks(rawTree);
      remainingBookmarksRef.current = bookmarks;

      const mapped = bookmarks.map((b) => ({ title: b.title, url: b.url }));
      const result = await generateFolderStructure(mapped, config, locale);
      setFolderStructure(result.folders);
      setPhase("editing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPhase("backup");
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
      const sorted = sortFoldersByPrefix(folderStructure);
      for (const folder of sorted) {
        await ensureFolderExists(folder.name);
        for (const child of folder.children) {
          await ensureFolderExists(`${folder.name}/${child.name}`);
        }
      }

      await reorderAllFolders();

      setPhase("classifying");

      const rawTree = await chrome.bookmarks.getTree();
      const bookmarks = flattenBookmarks(rawTree);
      const tree = await getFullTree();

      const inboxFolder = folderStructure.find((f) =>
        f.name.startsWith("00_"),
      );
      const inboxName = inboxFolder?.name ?? "00_📥_Inbox";

      const totalBatches = Math.ceil(bookmarks.length / CLASSIFY_BATCH_SIZE);
      const progress: BulkClassifyProgress = {
        total: totalBatches,
        completed: 0,
        failed: 0,
        currentTitle: "",
        status: "classifying",
      };
      setClassifyProgress({ ...progress });

      let totalMoved = 0;
      let totalFailed = 0;
      let completedBatches = 0;

      const batchItems: { batch: FlatBookmark[]; batchNum: number }[] = [];
      for (let i = 0; i < bookmarks.length; i += CLASSIFY_BATCH_SIZE) {
        batchItems.push({
          batch: bookmarks.slice(i, i + CLASSIFY_BATCH_SIZE),
          batchNum: Math.floor(i / CLASSIFY_BATCH_SIZE) + 1,
        });
      }

      async function processBatch(item: { batch: FlatBookmark[]; batchNum: number }) {
        const mapped = item.batch.map((b) => ({ title: b.title, url: b.url }));
        try {
          const results = await batchClassifyBookmarks(mapped, tree, config, locale);
          for (let j = 0; j < item.batch.length; j++) {
            const bm = item.batch[j]!;
            const classification = results[j];
            const targetFolder =
              classification && classification.confidence >= 0.5
                ? classification.folder_path
                : inboxName;
            try {
              await moveBookmark(bm.id, targetFolder, classification?.is_new_folder ?? false, bm.title, bm.url, "current");
              totalMoved++;
            } catch {
              try {
                await moveBookmark(bm.id, inboxName, false, bm.title, bm.url, "current");
              } catch { /* already moved/deleted */ }
              totalFailed++;
            }
          }
        } catch {
          for (const bm of item.batch) {
            try {
              await moveBookmark(bm.id, inboxName, false, bm.title, bm.url, "current");
            } catch { /* best effort */ }
            totalFailed++;
          }
        }
        completedBatches++;
        progress.completed = completedBatches;
        setClassifyProgress({ ...progress });
      }

      await runConcurrent(batchItems, processBatch, CONCURRENT_BATCHES);

      progress.completed = totalBatches;
      progress.failed = totalFailed;
      progress.status = "done";
      setClassifyProgress({
        ...progress,
        total: bookmarks.length,
        completed: totalMoved,
        failed: totalFailed,
      });

      const duplicateGroups = await findDuplicatePrefixFolders();
      if (duplicateGroups.length > 0) {
        try {
          const decisions = await decideFolderMerge(duplicateGroups, config, locale);
          for (const decision of decisions) {
            const group = duplicateGroups.find((g) => g.prefix === decision.prefix);
            if (!group) continue;
            const keepFolder = group.folders.find((f) => f.title === decision.keepTitle) ?? group.folders[0]!;
            const removeIds = group.folders.filter((f) => f.id !== keepFolder.id).map((f) => f.id);
            if (removeIds.length > 0) {
              await mergeFoldersInto(keepFolder.id, removeIds);
            }
          }
        } catch {
          // dedup is best-effort
        }
      }

      await reorderAllFolders();

      const newFolderPrefixes = folderStructure
        .map((f) => {
          const match = f.name.match(/^(\d+)/);
          return match?.[1] ?? "";
        })
        .filter(Boolean);
      const empties = await findEmptyFolders(newFolderPrefixes);
      setEmptyFolders(empties);
      setSelectedForCleanup(new Set(empties.map((f) => f.id)));

      if (empties.length > 0) {
        setPhase("cleanup");
      } else {
        setPhase("done");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
      setPhase("editing");
    }
  }

  async function handleCleanup() {
    const idsToRemove = Array.from(selectedForCleanup);
    if (idsToRemove.length > 0) {
      await removeFolders(idsToRemove);
    }
    setPhase("done");
  }

  function toggleCleanupSelection(id: string) {
    setSelectedForCleanup((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function togglePruneSelection(url: string) {
    setSelectedPrune((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  }

  function categoryLabel(cat: PruneCandidate["category"]): string {
    const keyMap: Record<PruneCandidate["category"], string> = {
      duplicate: "onboarding.step4.pruneCategoryDuplicate",
      outdated: "onboarding.step4.pruneCategoryOutdated",
      low_value: "onboarding.step4.pruneCategoryLowValue",
      broken: "onboarding.step4.pruneCategoryBroken",
    };
    return t(keyMap[cat]);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">
        {t("onboarding.step4.title")}
      </h2>

      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Phase: Backup */}
      {phase === "backup" && (
        <div className="py-6">
          <p className="text-sm text-muted-foreground mb-4">
            Before reorganizing, please download a backup of your current
            bookmarks.
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
            onClick={handleStartPrune}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {t("onboarding.step4.startPrune")}
          </button>
        </div>
      )}

      {/* Phase: Pruning Analysis */}
      {phase === "pruning_analyze" && (
        <div className="py-8 text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {t("onboarding.step4.pruneAnalyzing")}
          </p>
          {pruneBatchProgress.total > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("onboarding.step4.pruneProgress", {
                current: pruneBatchProgress.current,
                total: pruneBatchProgress.total,
              })}
            </p>
          )}
        </div>
      )}

      {/* Phase: Pruning Review */}
      {phase === "pruning_review" && (
        <div className="py-4">
          <h3 className="text-sm font-medium mb-2">
            {t("onboarding.step4.pruneTitle")}
          </h3>

          {pruneCandidates.length === 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {t("onboarding.step4.pruneEmpty")}
              </p>
              <button
                type="button"
                onClick={handlePruneSkip}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t("onboarding.step4.generateStructure")}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                {t("onboarding.step4.pruneDescription", {
                  count: pruneCandidates.length,
                })}
              </p>
              <ul className="space-y-1.5 mb-4 max-h-64 overflow-y-auto">
                {pruneCandidates.map((candidate) => (
                  <li
                    key={candidate.url}
                    className="flex items-start gap-2 p-2 border border-border rounded-md"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPrune.has(candidate.url)}
                      onChange={() => togglePruneSelection(candidate.url)}
                      className="mt-1 rounded border-input shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {candidate.title}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${CATEGORY_COLORS[candidate.category]}`}
                        >
                          {categoryLabel(candidate.category)}
                        </span>
                      </div>
                      <p
                        className="text-xs text-muted-foreground truncate"
                        title={candidate.url}
                      >
                        {candidate.url}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {candidate.reason}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handlePruneSkip}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {t("onboarding.step4.pruneSkip")}
                </button>
                <button
                  type="button"
                  onClick={handlePruneConfirm}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {t("onboarding.step4.pruneConfirm", {
                    count: selectedPrune.size,
                  })}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Phase: Analyzing (Generate Structure) */}
      {phase === "analyzing" && (
        <div className="py-8 text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("onboarding.step4.generating")}
          </p>
        </div>
      )}

      {/* Phase: Editing Folder Structure */}
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

      {/* Phase: Executing (Creating Folders) */}
      {phase === "executing" && (
        <div className="py-8 text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("onboarding.step4.processing", { current: 0, total: 0 })}
          </p>
        </div>
      )}

      {/* Phase: Classifying (Batch AI Classification) */}
      {phase === "classifying" && classifyProgress && (
        <div className="py-8 text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {t("onboarding.step4.classifying")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("onboarding.step4.classifyProgress", {
              current: Math.min(classifyProgress.completed + 1, classifyProgress.total),
              total: classifyProgress.total,
            })}
          </p>
          <div className="mt-3 w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{
                width: `${((classifyProgress.completed + classifyProgress.failed) / Math.max(classifyProgress.total, 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Phase: Cleanup */}
      {phase === "cleanup" && (
        <div className="py-6">
          <h3 className="text-sm font-medium mb-2">
            {t("onboarding.step4.cleanupTitle")}
          </h3>
          {emptyFolders.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-4">
              {t("onboarding.step4.cleanupEmpty")}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                {t("onboarding.step4.cleanupDescription")}
              </p>
              <ul className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
                {emptyFolders.map((folder) => (
                  <li key={folder.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedForCleanup.has(folder.id)}
                      onChange={() => toggleCleanupSelection(folder.id)}
                      className="rounded border-input"
                    />
                    <span className="text-sm truncate" title={folder.path}>
                      {folder.path}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPhase("done")}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t("onboarding.step4.cleanupSkip")}
            </button>
            {emptyFolders.length > 0 && (
              <button
                type="button"
                onClick={handleCleanup}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t("onboarding.step4.cleanupConfirm")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Phase: Done */}
      {phase === "done" && classifyProgress && (
        <div className="py-8 text-center">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-lg font-medium mb-2">
            {t("onboarding.step4.complete")}
          </p>
          <p className="text-sm text-muted-foreground mb-1">
            {t("onboarding.step4.succeeded", {
              count: classifyProgress.completed,
            })}
          </p>
          {classifyProgress.failed > 0 && (
            <p className="text-sm text-destructive">
              {t("onboarding.step4.failed", {
                count: classifyProgress.failed,
              })}
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

async function runConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const p = fn(item).then(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}
