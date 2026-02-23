import { generateId } from "@/shared/lib/utils";

const AUTO_CLEAR_MS = 5_000;

export function notifyArchiveSuccess(
  bookmarkTitle: string,
  folderName: string,
): void {
  const id = generateId();
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title: "Bookmark Archived",
    message: `"${bookmarkTitle}" → ${folderName}`,
  });
  setTimeout(() => chrome.notifications.clear(id), AUTO_CLEAR_MS);
}

export function notifyArchiveError(
  bookmarkTitle: string,
  errorMessage: string,
): void {
  const id = generateId();
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title: "Archive Failed",
    message: `Failed to archive "${bookmarkTitle}": ${errorMessage}`,
  });
  setTimeout(() => chrome.notifications.clear(id), AUTO_CLEAR_MS);
}
