import { storageGet, storageSet, getDecryptedApiConfig } from "@/shared/lib/storage";
import { testConnection } from "@/shared/lib/api-client";
import { initBookmarkListener, restorePendingDebounce, ensureInboxExists, markAsMoving, unmarkAsMoving } from "./bookmark-listener";
import {
  dequeueTask,
  updateTask,
  getQueueLength,
  enqueueTask,
} from "./task-queue";
import { extractContent } from "./content-extractor";
import { classifyBookmark, renameBookmark } from "./ai-classifier";
import { moveBookmark } from "./bookmark-mover";
import { notifyArchiveSuccess, notifyArchiveError, findUndoRecord, clearExpiredUndoRecords } from "./notification";
import { getFullTree, findFolderByPath } from "@/shared/lib/bookmark-tree";
import { generateId } from "@/shared/lib/utils";

const QUEUE_ALARM = "queue-check";

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureInboxExists();

  chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 0.5 });

  chrome.contextMenus.create({
    id: "ai-re-archive",
    title: "AI Re-archive this bookmark",
    contexts: ["page", "link"],
  });

  if (details.reason === "install") {
    const completed = await storageGet("onboarding_completed");
    if (!completed) {
      chrome.tabs.create({
        url: chrome.runtime.getURL("src/onboarding/index.html"),
      });
    }
  }

  injectContentScriptIntoExistingTabs();
  updateBadge();
});

async function injectContentScriptIntoExistingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["src/content/index.ts"],
        });
      } catch {
        // Tab may not allow script injection
      }
    }
  } catch {
    // Permissions may not be available
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === QUEUE_ALARM) {
    processQueue();
    clearExpiredUndoRecords();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "ai-re-archive") return;

  const targetUrl = info.linkUrl ?? info.pageUrl;
  if (!targetUrl) return;

  const results = await chrome.bookmarks.search({ url: targetUrl });
  const bookmark = results[0];
  if (bookmark) {
    await enqueueTask({
      id: generateId(),
      bookmarkId: bookmark.id,
      title: bookmark.title,
      url: bookmark.url ?? "",
      status: "pending",
      createdAt: Date.now(),
    });
  } else if (tab?.title) {
    const created = await chrome.bookmarks.create({
      title: tab.title,
      url: targetUrl,
    });
    await enqueueTask({
      id: generateId(),
      bookmarkId: created.id,
      title: tab.title,
      url: targetUrl,
      status: "pending",
      createdAt: Date.now(),
    });
  }
  processQueue();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TEST_API_CONNECTION") {
    handleTestConnection().then(sendResponse);
    return true;
  }

  if (message.type === "RE_ARCHIVE_BOOKMARK") {
    handleReArchive(message.payload.bookmarkId).then(sendResponse);
    return true;
  }

  if (message.type === "START_BULK_ARCHIVE") {
    sendResponse({ started: true });
    return false;
  }

  if (message.type === "REVIEW_DECISION") {
    handleReviewDecision(
      message.payload.bookmarkId,
      message.payload.decision,
    ).then(sendResponse);
    return true;
  }

  if (message.type === "OPEN_TASKS_PAGE") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/options/index.html?tab=tasks"),
    });
    sendResponse({ opened: true });
    return false;
  }

  if (message.type === "_PROCESS_QUEUE") {
    processQueue();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.task_queue) {
    updateBadge();
  }
});

chrome.notifications.onButtonClicked.addListener((notifId, buttonIndex) => {
  if (buttonIndex === 0) {
    handleUndoArchive(notifId);
  }
});

async function handleUndoArchive(notificationId: string): Promise<void> {
  try {
    const record = await findUndoRecord(notificationId);
    if (!record) return;

    markAsMoving(record.bookmarkId);
    await chrome.bookmarks.move(record.bookmarkId, {
      parentId: record.originalParentId,
    });
    unmarkAsMoving(record.bookmarkId);

    if (record.renamedTitle) {
      await chrome.bookmarks.update(record.bookmarkId, {
        title: record.originalTitle,
      });
    }

    chrome.notifications.clear(notificationId);

    const records = (await storageGet("undo_records")) ?? [];
    await storageSet(
      "undo_records",
      records.filter((r) => r.notificationId !== notificationId),
    );
  } catch (error) {
    console.error("[Undo] Failed to undo archive:", error);
  }
}

initBookmarkListener();
restorePendingDebounce();

async function updateBadge() {
  try {
    const queue = (await storageGet("task_queue")) ?? [];
    const active = queue.filter(
      (t) =>
        t.status === "pending" ||
        t.status === "extracting" ||
        t.status === "classifying" ||
        t.status === "moving" ||
        t.status === "renaming",
    ).length;

    if (active > 0) {
      await chrome.action.setBadgeText({ text: String(active) });
      await chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch {
    // Badge API may not be available in all contexts
  }
}

async function handleTestConnection(): Promise<{ success: boolean }> {
  const config = await getDecryptedApiConfig();
  if (!config) return { success: false };
  const success = await testConnection(config);
  return { success };
}

async function handleReArchive(
  bookmarkId: string,
): Promise<{ enqueued: boolean }> {
  const bookmarks = await chrome.bookmarks.get(bookmarkId);
  const bookmark = bookmarks[0];
  if (!bookmark?.url) return { enqueued: false };

  await enqueueTask({
    id: generateId(),
    bookmarkId: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    status: "pending",
    createdAt: Date.now(),
  });

  processQueue();
  return { enqueued: true };
}

async function handleReviewDecision(
  bookmarkId: string,
  decision: "keep" | "discard",
): Promise<{ success: boolean }> {
  try {
    if (decision === "discard") {
      await chrome.bookmarks.remove(bookmarkId);
      await storageSet("pending_bookmark_review", null);
      return { success: true };
    }

    const config = await getDecryptedApiConfig();
    if (!config) {
      const inboxId = await ensureInboxExists();
      markAsMoving(bookmarkId);
      await chrome.bookmarks.move(bookmarkId, { parentId: inboxId });
      unmarkAsMoving(bookmarkId);
      await storageSet("pending_bookmark_review", null);
      return { success: true };
    }

    const tree = await getFullTree();
    const bookmarks = await chrome.bookmarks.get(bookmarkId);
    const bookmark = bookmarks[0];
    if (!bookmark?.url) {
      await storageSet("pending_bookmark_review", null);
      return { success: false };
    }

    const locale = navigator.language.startsWith("zh") ? "zh-CN" : "en";
    const classification = await classifyBookmark(
      { title: bookmark.title, url: bookmark.url },
      null,
      tree,
      config,
      locale,
    );

    await moveBookmark(
      bookmarkId,
      classification.folder_path,
      classification.is_new_folder,
      bookmark.title,
      bookmark.url,
      "📥_Inbox",
    );

    await storageSet("pending_bookmark_review", null);
    return { success: true };
  } catch {
    await storageSet("pending_bookmark_review", null);
    return { success: false };
  }
}

let processing = false;

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    while (true) {
      const remaining = await getQueueLength();
      if (remaining === 0) break;

      const task = await dequeueTask();
      if (!task) break;

      await updateTask(task.id, { status: "extracting" });

      let content = null;
      if (task.tabId) {
        content = await extractContent(task.tabId);
      }

      await updateTask(task.id, { status: "classifying" });

      const config = await getDecryptedApiConfig();
      if (!config) {
        await updateTask(task.id, {
          status: "error",
          error: "API not configured",
        });
        continue;
      }

      const tree = await getFullTree();
      const queueLocale = navigator.language.startsWith("zh") ? "zh-CN" : "en";
      const classification = await classifyBookmark(
        { title: task.title, url: task.url },
        content,
        tree,
        config,
        queueLocale,
      );

      await updateTask(task.id, { status: "moving" });

      let originalParentId = task.originalParentId;
      if (!originalParentId) {
        try {
          const [current] = await chrome.bookmarks.get(task.bookmarkId);
          originalParentId = current?.parentId;
        } catch {
          // Bookmark may have been removed
        }
      }

      const fromFolder = originalParentId ? undefined : "📥_Inbox";
      const result = await moveBookmark(
        task.bookmarkId,
        classification.folder_path,
        classification.is_new_folder,
        task.title,
        task.url,
        fromFolder ?? "📥_Inbox",
      );

      if (result.success) {
        await updateTask(task.id, { status: "renaming" });

        const newTitle = await renameBookmark(
          { title: task.title, url: task.url },
          config,
          queueLocale,
        );

        if (newTitle !== task.title) {
          try {
            await chrome.bookmarks.update(task.bookmarkId, { title: newTitle });
          } catch {
            // Bookmark may have been removed
          }
        }

        await updateTask(task.id, {
          status: "done",
          targetFolder: result.toFolder,
          renamedTitle: newTitle !== task.title ? newTitle : undefined,
        });

        const targetFolderId = await findFolderByPath(classification.folder_path);
        notifyArchiveSuccess({
          bookmarkTitle: newTitle,
          folderName: result.toFolder,
          bookmarkId: task.bookmarkId,
          originalParentId: originalParentId ?? "",
          targetParentId: targetFolderId ?? "",
          originalTitle: task.title,
          renamedTitle: newTitle !== task.title ? newTitle : undefined,
        });
      } else {
        await updateTask(task.id, {
          status: "error",
          error: result.error,
        });
        notifyArchiveError(task.title, result.error ?? "Unknown error");
      }
    }
  } finally {
    processing = false;
    updateBadge();
  }
}

export { processQueue as _processQueue };
