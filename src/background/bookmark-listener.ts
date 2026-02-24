import { findFolderByPath, ensureFolderExists } from "@/shared/lib/bookmark-tree";
import { getDecryptedApiConfig } from "@/shared/lib/storage";
import { enqueueTask } from "./task-queue";
import { generateId } from "@/shared/lib/utils";

const INBOX_FOLDER = "00_📥_Inbox";

const movingBookmarkIds = new Set<string>();
let importing = false;

export function markAsMoving(bookmarkId: string) {
  movingBookmarkIds.add(bookmarkId);
}

export function unmarkAsMoving(bookmarkId: string) {
  movingBookmarkIds.delete(bookmarkId);
}

let ensureInboxPromise: Promise<string> | null = null;

export async function ensureInboxExists(): Promise<string> {
  if (ensureInboxPromise) return ensureInboxPromise;
  ensureInboxPromise = (async () => {
    const existing = await findFolderByPath(INBOX_FOLDER);
    if (existing) return existing;
    return ensureFolderExists(INBOX_FOLDER);
  })();
  try {
    return await ensureInboxPromise;
  } finally {
    ensureInboxPromise = null;
  }
}

export function initBookmarkListener() {
  chrome.bookmarks.onCreated.addListener(handleBookmarkCreated);
  chrome.bookmarks.onImportBegan.addListener(() => {
    importing = true;
  });
  chrome.bookmarks.onImportEnded.addListener(() => {
    importing = false;
  });
}

async function handleBookmarkCreated(
  id: string,
  bookmark: chrome.bookmarks.BookmarkTreeNode,
) {
  if (importing) return;
  if (!bookmark.url) return;

  if (movingBookmarkIds.has(id)) {
    movingBookmarkIds.delete(id);
    return;
  }

  try {
    const inboxId = await ensureInboxExists();
    markAsMoving(id);
    await chrome.bookmarks.move(id, { parentId: inboxId });
    unmarkAsMoving(id);

    const config = await getDecryptedApiConfig();
    if (!config) return;

    await enqueueTask({
      id: generateId(),
      bookmarkId: id,
      title: bookmark.title,
      url: bookmark.url,
      status: "pending",
      createdAt: Date.now(),
    });

    chrome.runtime.sendMessage({ type: "_PROCESS_QUEUE" }).catch(() => {});
  } catch (error) {
    unmarkAsMoving(id);
    console.error("[Bookmark Listener] Failed to handle new bookmark:", error);
  }
}

export { handleBookmarkCreated as _handleBookmarkCreated };
