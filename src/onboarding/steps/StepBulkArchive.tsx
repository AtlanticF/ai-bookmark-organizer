import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useApiConfig } from "@/shared/hooks";
import {
  flattenBookmarks,
  ensureFolderExists,
  findEmptyFolders,
  removeFolders,
  reorderAllFolders,
  sortFoldersByPrefix,
  type FlatBookmark,
} from "@/shared/lib/bookmark-tree";
import {
  exportBookmarksAsHtml,
  downloadHtmlFile,
} from "@/shared/lib/bookmark-export";
import {
  generateFolderStructure,
  batchClassifyIntoProposed,
  batchRenameBookmarks,
  pruneBookmarks,
  assignPrefixes,
  isInboxFolder,
  isArchiveFolder,
} from "@/background/ai-classifier";
import { moveBookmark } from "@/background/bookmark-mover";
import FolderTreeEditor from "@/shared/components/FolderTreeEditor";
import type {
  ProposedFolder,
  BulkClassifyProgress,
  EmptyFolder,
  PruneCandidate,
} from "@/shared/types";

const PRUNE_BATCH_SIZE = 100;
const CLASSIFY_BATCH_SIZE = 50;
const RENAME_BATCH_SIZE = 50;
const CONCURRENT_BATCHES = 3;

interface RenamePreviewItem {
  id: string;
  url: string;
  originalTitle: string;
  newTitle: string;
}

type SubPhase =
  | "backup"
  | "pruning_analyze"
  | "pruning_review"
  | "renaming"
  | "rename_review"
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
  const [renamePreview, setRenamePreview] = useState<RenamePreviewItem[]>([]);
  const [renameBatchProgress, setRenameBatchProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");

  const remainingBookmarksRef = useRef<FlatBookmark[]>([]);
  const assignmentsRef = useRef<Map<string, string>>(new Map());

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

    await handleStartRename();
  }

  async function handlePruneSkip() {
    await handleStartRename();
  }

  async function handleStartRename() {
    setError("");
    setPhase("renaming");

    try {
      const rawTree = await chrome.bookmarks.getTree();
      const bookmarks = flattenBookmarks(rawTree);
      remainingBookmarksRef.current = bookmarks;

      const mapped = bookmarks.map((b) => ({ title: b.title, url: b.url }));
      const totalBatches = Math.ceil(mapped.length / RENAME_BATCH_SIZE);
      setRenameBatchProgress({ current: 0, total: totalBatches });

      const allResults: RenamePreviewItem[] = [];
      let renameDone = 0;

      const renameBatches: { bookmarks: FlatBookmark[]; mapped: { title: string; url: string }[] }[] = [];
      for (let i = 0; i < bookmarks.length; i += RENAME_BATCH_SIZE) {
        const batchBookmarks = bookmarks.slice(i, i + RENAME_BATCH_SIZE);
        renameBatches.push({
          bookmarks: batchBookmarks,
          mapped: batchBookmarks.map((b) => ({ title: b.title, url: b.url })),
        });
      }

      await runConcurrent(
        renameBatches,
        async (batch) => {
          const results = await batchRenameBookmarks(batch.mapped, config, locale);
          for (let j = 0; j < batch.bookmarks.length; j++) {
            const bm = batch.bookmarks[j]!;
            const result = results[j];
            allResults.push({
              id: bm.id,
              url: bm.url,
              originalTitle: bm.title,
              newTitle: result?.newTitle ?? bm.title,
            });
          }
          renameDone++;
          setRenameBatchProgress({ current: renameDone, total: totalBatches });
        },
        CONCURRENT_BATCHES,
      );

      setRenamePreview(allResults);
      setPhase("rename_review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
      setPhase("backup");
    }
  }

  function handleRenameEdit(index: number, newTitle: string) {
    setRenamePreview((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index]!, newTitle };
      return updated;
    });
  }

  async function handleRenameConfirm() {
    setError("");
    try {
      for (const item of renamePreview) {
        if (item.newTitle !== item.originalTitle) {
          try {
            await chrome.bookmarks.update(item.id, { title: item.newTitle });
          } catch {
            // bookmark may have been deleted
          }
        }
      }
      await handleGenerate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename apply failed");
      setPhase("rename_review");
    }
  }

  async function handleRenameSkip() {
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

      const inboxFolder = result.folders.find((f) => isInboxFolder(f.name));
      const inboxName = inboxFolder?.name ?? "📥_Inbox";

      setPhase("classifying");
      const totalBatches = Math.ceil(bookmarks.length / CLASSIFY_BATCH_SIZE);
      const progress: BulkClassifyProgress = {
        total: totalBatches,
        completed: 0,
        failed: 0,
        currentTitle: "",
        status: "classifying",
      };
      setClassifyProgress({ ...progress });

      const newAssignments = new Map<string, string>();
      let completedBatches = 0;

      const batchItems: FlatBookmark[][] = [];
      for (let i = 0; i < bookmarks.length; i += CLASSIFY_BATCH_SIZE) {
        batchItems.push(bookmarks.slice(i, i + CLASSIFY_BATCH_SIZE));
      }

      await runConcurrent(
        batchItems,
        async (batch) => {
          const batchMapped = batch.map((b) => ({ title: b.title, url: b.url }));
          try {
            const results = await batchClassifyIntoProposed(
              batchMapped,
              result.folders,
              config,
              locale,
            );
            for (let j = 0; j < batch.length; j++) {
              const bm = batch[j]!;
              const classification = results[j];
              const folderPath =
                classification && classification.confidence >= 0.5
                  ? classification.folder_path
                  : inboxName;
              newAssignments.set(bm.id, folderPath);
            }
          } catch {
            for (const bm of batch) {
              newAssignments.set(bm.id, inboxName);
            }
          }
          completedBatches++;
          progress.completed = completedBatches;
          setClassifyProgress({ ...progress });
        },
        CONCURRENT_BATCHES,
      );

      assignmentsRef.current = newAssignments;

      const counts = new Map<string, number>();
      for (const folderPath of newAssignments.values()) {
        counts.set(folderPath, (counts.get(folderPath) ?? 0) + 1);
      }
      const updatedFolders = result.folders.map((f) => ({
        ...f,
        estimated_count:
          (counts.get(f.name) ?? 0) +
          f.children.reduce(
            (sum, c) => sum + (counts.get(`${f.name}/${c.name}`) ?? 0),
            0,
          ),
      }));
      setFolderStructure(updatedFolders);

      setPhase("editing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPhase("backup");
    }
  }

  function handleFolderStructureChange(newFolders: ProposedFolder[]) {
    const oldFolders = folderStructure;
    const assignments = assignmentsRef.current;

    for (let i = 0; i < Math.min(oldFolders.length, newFolders.length); i++) {
      const oldFolder = oldFolders[i]!;
      const newFolder = newFolders[i]!;

      if (oldFolder.name !== newFolder.name) {
        for (const [id, path] of assignments) {
          if (path === oldFolder.name) {
            assignments.set(id, newFolder.name);
          } else if (path.startsWith(oldFolder.name + "/")) {
            assignments.set(
              id,
              newFolder.name + path.slice(oldFolder.name.length),
            );
          }
        }
      }

      const parentName = newFolder.name;
      for (
        let j = 0;
        j < Math.min(oldFolder.children.length, newFolder.children.length);
        j++
      ) {
        const oldChild = oldFolder.children[j]!;
        const newChild = newFolder.children[j]!;
        if (oldChild.name !== newChild.name) {
          const oldPath = `${parentName}/${oldChild.name}`;
          const newPath = `${parentName}/${newChild.name}`;
          for (const [id, path] of assignments) {
            if (path === oldPath) {
              assignments.set(id, newPath);
            }
          }
        }
      }
    }

    const inboxFolder = newFolders.find((f) => isInboxFolder(f.name));
    const inboxPath = inboxFolder?.name ?? "📥_Inbox";
    const validPaths = new Set<string>();
    for (const f of newFolders) {
      validPaths.add(f.name);
      for (const c of f.children) {
        validPaths.add(`${f.name}/${c.name}`);
      }
    }
    for (const [id, path] of assignments) {
      if (!validPaths.has(path)) {
        assignments.set(id, inboxPath);
      }
    }

    setFolderStructure(newFolders);
  }

  function handleAddCategory() {
    const updated = [...folderStructure];
    const archiveIndex = updated.findIndex((f) => isArchiveFolder(f.name));
    const insertIndex = archiveIndex >= 0 ? archiveIndex : updated.length;
    updated.splice(insertIndex, 0, {
      name: "📁_New Category",
      description: "New category",
      children: [],
      estimated_count: 0,
    });
    setFolderStructure(updated);
  }

  async function handleExecute() {
    setPhase("executing");
    setError("");

    try {
      const prefixed = assignPrefixes(folderStructure);
      const sorted = sortFoldersByPrefix(prefixed);

      const nameMapping = new Map<string, string>();
      for (let i = 0; i < folderStructure.length; i++) {
        const unprefixed = folderStructure[i]!;
        const pf = prefixed[i]!;
        nameMapping.set(unprefixed.name, pf.name);
        for (let j = 0; j < unprefixed.children.length; j++) {
          const uc = unprefixed.children[j]!;
          const pc = pf.children[j]!;
          nameMapping.set(
            `${unprefixed.name}/${uc.name}`,
            `${pf.name}/${pc.name}`,
          );
        }
      }

      for (const folder of sorted) {
        await ensureFolderExists(folder.name);
        for (const child of folder.children) {
          await ensureFolderExists(`${folder.name}/${child.name}`);
        }
      }

      await reorderAllFolders();

      const assignments = assignmentsRef.current;
      const inboxFolder = prefixed.find((f) => isInboxFolder(f.name));
      const inboxName = inboxFolder?.name ?? "00_📥_Inbox";

      const total = assignments.size;
      let totalMoved = 0;
      let totalFailed = 0;

      setClassifyProgress({
        total,
        completed: 0,
        failed: 0,
        currentTitle: "",
        status: "moving",
      });

      for (const [bookmarkId, unprefixedPath] of assignments) {
        const prefixedPath = nameMapping.get(unprefixedPath) ?? inboxName;
        const bm = remainingBookmarksRef.current.find(
          (b) => b.id === bookmarkId,
        );
        if (!bm) continue;

        try {
          await moveBookmark(
            bookmarkId,
            prefixedPath,
            false,
            bm.title,
            bm.url,
            "current",
          );
          totalMoved++;
        } catch {
          try {
            await moveBookmark(
              bookmarkId,
              inboxName,
              false,
              bm.title,
              bm.url,
              "current",
            );
          } catch {
            /* already moved/deleted */
          }
          totalFailed++;
        }

        if ((totalMoved + totalFailed) % 10 === 0) {
          setClassifyProgress({
            total,
            completed: totalMoved,
            failed: totalFailed,
            currentTitle: "",
            status: "moving",
          });
        }
      }

      setClassifyProgress({
        total,
        completed: totalMoved,
        failed: totalFailed,
        currentTitle: "",
        status: "done",
      });

      await reorderAllFolders();

      const newFolderNames = prefixed.map((f) => f.name);
      const empties = await findEmptyFolders(newFolderNames);
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

      {/* Phase: Renaming (AI Batch Rename) */}
      {phase === "renaming" && (
        <div className="py-8 text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {t("onboarding.step4.renaming")}
          </p>
          {renameBatchProgress.total > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("onboarding.step4.renameProgress", {
                current: renameBatchProgress.current,
                total: renameBatchProgress.total,
              })}
            </p>
          )}
        </div>
      )}

      {/* Phase: Rename Review */}
      {phase === "rename_review" && (
        <div className="py-4">
          <h3 className="text-sm font-medium mb-2">
            {t("onboarding.step4.renameTitle")}
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            {t("onboarding.step4.renameDescription", {
              count: renamePreview.filter((r) => r.newTitle !== r.originalTitle).length,
            })}
          </p>
          <ul className="space-y-1.5 mb-4 max-h-80 overflow-y-auto">
            {renamePreview.map((item, idx) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 p-2 border border-border rounded-md"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t("onboarding.step4.renameOriginal")}
                  </span>
                  <span className="text-xs truncate" title={item.originalTitle}>
                    {item.originalTitle}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">→</span>
                  <input
                    type="text"
                    value={item.newTitle}
                    onChange={(e) => handleRenameEdit(idx, e.target.value)}
                    className={`flex-1 px-2 py-1 text-xs border rounded bg-background ${
                      item.newTitle !== item.originalTitle
                        ? "border-primary/50"
                        : "border-input"
                    }`}
                    data-testid={`rename-input-${idx}`}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleRenameSkip}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t("onboarding.step4.renameSkip")}
            </button>
            <button
              type="button"
              onClick={handleRenameConfirm}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t("onboarding.step4.renameConfirm", {
                count: renamePreview.filter((r) => r.newTitle !== r.originalTitle).length,
              })}
            </button>
          </div>
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
          <h3 className="text-sm font-medium mb-1">
            {t("onboarding.step4.folderEditor")}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t("onboarding.step4.folderEditorHint")}
          </p>
          <div className="mb-4 max-h-[60vh] overflow-y-auto">
            <FolderTreeEditor
              folders={folderStructure}
              onChange={handleFolderStructureChange}
              isProtected={(name) =>
                isInboxFolder(name) || isArchiveFolder(name)
              }
            />
          </div>
          <div className="flex gap-3 justify-between">
            <button
              type="button"
              onClick={handleAddCategory}
              className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
            >
              + {t("onboarding.step4.addCategory")}
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

      {/* Phase: Classifying (during analysis, before editing) */}
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
                width: `${(classifyProgress.completed / Math.max(classifyProgress.total, 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Phase: Executing (Creating Folders & Moving Bookmarks) */}
      {phase === "executing" && (
        <div className="py-8 text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {t("onboarding.step4.movingBookmarks")}
          </p>
          {classifyProgress && classifyProgress.total > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                {t("onboarding.step4.moveProgress", {
                  current: classifyProgress.completed + classifyProgress.failed,
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
            </>
          )}
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
