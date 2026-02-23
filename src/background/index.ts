import { storageGet } from "@/shared/lib/storage";
import { testConnection } from "@/shared/lib/api-client";
import { initBookmarkListener, ensureInboxExists } from "./bookmark-listener";
import {
  dequeueTask,
  updateTask,
  removeTask,
  getQueueLength,
  enqueueTask,
} from "./task-queue";
import { extractContent } from "./content-extractor";
import { classifyBookmark } from "./ai-classifier";
import { moveBookmark } from "./bookmark-mover";
import { notifyArchiveSuccess, notifyArchiveError } from "./notification";
import { getFullTree } from "@/shared/lib/bookmark-tree";
import { generateId } from "@/shared/lib/utils";

const QUEUE_ALARM = "queue-check";

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureInboxExists();

  chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 0.5 });

  chrome.contextMenus.create({
    id: "ai-re-archive",
    title: "AI Re-archive this bookmark",
    contexts: ["bookmark" as chrome.contextMenus.ContextType],
  });

  if (details.reason === "install") {
    const completed = await storageGet("onboarding_completed");
    if (!completed) {
      chrome.tabs.create({
        url: chrome.runtime.getURL("src/onboarding/index.html"),
      });
    }
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === QUEUE_ALARM) {
    processQueue();
  }
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const bookmarkId = (info as unknown as { bookmarkId?: string }).bookmarkId;
  if (info.menuItemId === "ai-re-archive" && bookmarkId) {
    const bookmarks = await chrome.bookmarks.get(bookmarkId);
    const bookmark = bookmarks[0];
    if (bookmark?.url) {
      await enqueueTask({
        id: generateId(),
        bookmarkId: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        status: "pending",
        createdAt: Date.now(),
      });
      processQueue();
    }
  }
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

  return false;
});

initBookmarkListener();

async function handleTestConnection(): Promise<{ success: boolean }> {
  const config = await storageGet("api_config");
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

      const config = await storageGet("api_config");
      if (!config) {
        await updateTask(task.id, {
          status: "error",
          error: "API not configured",
        });
        continue;
      }

      const tree = await getFullTree();
      const classification = await classifyBookmark(
        { title: task.title, url: task.url },
        content,
        tree,
        config,
      );

      await updateTask(task.id, { status: "moving" });

      const result = await moveBookmark(
        task.bookmarkId,
        classification.folder_path,
        classification.is_new_folder,
        task.title,
        task.url,
        "00_📥_Inbox",
      );

      if (result.success) {
        await removeTask(task.id);
        notifyArchiveSuccess(task.title, result.toFolder);
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
  }
}

export { processQueue as _processQueue };
