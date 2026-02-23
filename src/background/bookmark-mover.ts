import { ensureFolderExists, findFolderByPath } from "@/shared/lib/bookmark-tree";
import { storageGet, storageSet } from "@/shared/lib/storage";
import type { ArchiveRecord, BulkProgress } from "@/shared/types";
import { markAsMoving, unmarkAsMoving } from "./bookmark-listener";

const MAX_HISTORY = 50;

export interface MoveResult {
  success: boolean;
  toFolder: string;
  error?: string;
}

export interface BookmarkAssignment {
  bookmarkId: string;
  title: string;
  url: string;
  fromFolder: string;
  targetFolderPath: string;
  isNewFolder: boolean;
}

export async function moveBookmark(
  bookmarkId: string,
  targetFolderPath: string,
  isNewFolder: boolean,
  bookmarkTitle: string,
  bookmarkUrl: string,
  fromFolder: string,
): Promise<MoveResult> {
  try {
    let folderId: string | null;

    if (isNewFolder) {
      folderId = await ensureFolderExists(targetFolderPath);
    } else {
      folderId = await findFolderByPath(targetFolderPath);
      if (!folderId) {
        folderId = await ensureFolderExists(targetFolderPath);
      }
    }

    markAsMoving(bookmarkId);
    await chrome.bookmarks.move(bookmarkId, { parentId: folderId });
    unmarkAsMoving(bookmarkId);

    await addArchiveRecord({
      bookmarkId,
      title: bookmarkTitle,
      url: bookmarkUrl,
      fromFolder,
      toFolder: targetFolderPath,
      timestamp: Date.now(),
    });

    return { success: true, toFolder: targetFolderPath };
  } catch (error) {
    unmarkAsMoving(bookmarkId);
    return {
      success: false,
      toFolder: targetFolderPath,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function batchMoveBookmarks(
  assignments: BookmarkAssignment[],
): Promise<BulkProgress> {
  const progress: BulkProgress = {
    total: assignments.length,
    completed: 0,
    failed: 0,
    status: "running",
  };

  await storageSet("bulk_archive_progress", progress);

  for (const assignment of assignments) {
    const result = await moveBookmark(
      assignment.bookmarkId,
      assignment.targetFolderPath,
      assignment.isNewFolder,
      assignment.title,
      assignment.url,
      assignment.fromFolder,
    );

    if (result.success) {
      progress.completed++;
    } else {
      progress.failed++;
    }

    await storageSet("bulk_archive_progress", { ...progress });
  }

  progress.status = progress.failed > 0 && progress.completed === 0 ? "error" : "done";
  await storageSet("bulk_archive_progress", progress);

  return progress;
}

async function addArchiveRecord(record: ArchiveRecord): Promise<void> {
  const history = (await storageGet("archive_history")) ?? [];
  history.unshift(record);
  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }
  await storageSet("archive_history", history);
}
