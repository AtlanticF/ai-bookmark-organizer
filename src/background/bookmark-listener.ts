import { findFolderByPath, ensureFolderExists } from "@/shared/lib/bookmark-tree";
import { generateId } from "@/shared/lib/utils";
import type { QueueTask } from "@/shared/types";
import { enqueueTask } from "./task-queue";

const INBOX_FOLDER = "00_📥_Inbox";

const movingBookmarkIds = new Set<string>();

export function markAsMoving(bookmarkId: string) {
  movingBookmarkIds.add(bookmarkId);
}

export function unmarkAsMoving(bookmarkId: string) {
  movingBookmarkIds.delete(bookmarkId);
}

export async function ensureInboxExists(): Promise<string> {
  const existing = await findFolderByPath(INBOX_FOLDER);
  if (existing) return existing;
  return ensureFolderExists(INBOX_FOLDER);
}

export function initBookmarkListener() {
  chrome.bookmarks.onCreated.addListener(handleBookmarkCreated);
}

async function handleBookmarkCreated(
  id: string,
  bookmark: chrome.bookmarks.BookmarkTreeNode,
) {
  if (!bookmark.url) return;

  if (movingBookmarkIds.has(id)) {
    movingBookmarkIds.delete(id);
    return;
  }

  try {
    const inboxId = await ensureInboxExists();

    if (bookmark.parentId === inboxId) return;

    markAsMoving(id);
    await chrome.bookmarks.move(id, { parentId: inboxId });
    unmarkAsMoving(id);

    const task: QueueTask = {
      id: generateId(),
      bookmarkId: id,
      title: bookmark.title,
      url: bookmark.url,
      status: "pending",
      tabId: undefined,
      createdAt: Date.now(),
    };

    await enqueueTask(task);
  } catch (error) {
    unmarkAsMoving(id);
    console.error("[Bookmark Listener] Failed to process bookmark:", error);
  }
}

export { handleBookmarkCreated as _handleBookmarkCreated };
