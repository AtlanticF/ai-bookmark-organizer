import { findFolderByPath, ensureFolderExists } from "@/shared/lib/bookmark-tree";
import { getDecryptedApiConfig, storageGet, storageSet } from "@/shared/lib/storage";
import { enqueueTask } from "./task-queue";
import { generateId } from "@/shared/lib/utils";
import type { PendingDebounceBookmark } from "@/shared/types";

const INBOX_FOLDER = "📥_Inbox";

const DEBOUNCE_INITIAL_MS = 5_000;
const DEBOUNCE_RESET_MS = 2_000;
const STALE_THRESHOLD_MS = 60_000;

const movingBookmarkIds = new Set<string>();
const pendingMap = new Map<string, ReturnType<typeof setTimeout>>();
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
  chrome.bookmarks.onMoved.addListener(handleBookmarkMoved);
  chrome.bookmarks.onChanged.addListener(handleBookmarkChanged);
  chrome.bookmarks.onRemoved.addListener(handleBookmarkRemoved);
  chrome.bookmarks.onImportBegan.addListener(() => {
    importing = true;
  });
  chrome.bookmarks.onImportEnded.addListener(() => {
    importing = false;
  });
}

function schedulePending(bookmarkId: string, delayMs: number) {
  const existing = pendingMap.get(bookmarkId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingMap.delete(bookmarkId);
    processStabilizedBookmark(bookmarkId);
  }, delayMs);
  pendingMap.set(bookmarkId, timer);
}

async function persistPending(bookmarkId: string, url: string, title: string) {
  const list = (await storageGet("pending_debounce")) ?? [];
  if (!list.some((p) => p.bookmarkId === bookmarkId)) {
    list.push({ bookmarkId, url, title, createdAt: Date.now() });
    await storageSet("pending_debounce", list);
  }
}

async function removePersisted(bookmarkId: string) {
  const list = (await storageGet("pending_debounce")) ?? [];
  const filtered = list.filter((p) => p.bookmarkId !== bookmarkId);
  if (filtered.length !== list.length) {
    await storageSet("pending_debounce", filtered);
  }
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

  const config = await getDecryptedApiConfig();
  if (!config) return;

  schedulePending(id, DEBOUNCE_INITIAL_MS);
  persistPending(id, bookmark.url, bookmark.title);
}

function handleBookmarkMoved(id: string) {
  if (movingBookmarkIds.has(id)) return;
  if (!pendingMap.has(id)) return;
  schedulePending(id, DEBOUNCE_RESET_MS);
}

function handleBookmarkChanged(id: string) {
  if (!pendingMap.has(id)) return;
  schedulePending(id, DEBOUNCE_RESET_MS);
}

function handleBookmarkRemoved(id: string) {
  const timer = pendingMap.get(id);
  if (timer) {
    clearTimeout(timer);
    pendingMap.delete(id);
    removePersisted(id);
  }
}

async function processStabilizedBookmark(bookmarkId: string) {
  try {
    const [bookmark] = await chrome.bookmarks.get(bookmarkId);
    if (!bookmark?.url) {
      await removePersisted(bookmarkId);
      return;
    }

    await enqueueTask({
      id: generateId(),
      bookmarkId,
      title: bookmark.title,
      url: bookmark.url,
      status: "pending",
      createdAt: Date.now(),
      originalParentId: bookmark.parentId,
    });

    await removePersisted(bookmarkId);
    chrome.runtime.sendMessage({ type: "_PROCESS_QUEUE" }).catch(() => {});
  } catch (error) {
    await removePersisted(bookmarkId);
    console.error("[Bookmark Listener] Failed to process stabilized bookmark:", error);
  }
}

export async function restorePendingDebounce(): Promise<void> {
  const list = (await storageGet("pending_debounce")) ?? [];
  if (list.length === 0) return;

  const now = Date.now();
  const stale: PendingDebounceBookmark[] = [];
  const fresh: PendingDebounceBookmark[] = [];

  for (const entry of list) {
    if (now - entry.createdAt > STALE_THRESHOLD_MS) {
      stale.push(entry);
    } else {
      fresh.push(entry);
    }
  }

  for (const entry of stale) {
    await processStabilizedBookmark(entry.bookmarkId);
  }

  for (const entry of fresh) {
    const remaining = DEBOUNCE_INITIAL_MS - (now - entry.createdAt);
    schedulePending(entry.bookmarkId, Math.max(remaining, 500));
  }
}

export { handleBookmarkCreated as _handleBookmarkCreated };
