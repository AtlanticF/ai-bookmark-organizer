import { generateId } from "@/shared/lib/utils";
import { storageGet, storageSet } from "@/shared/lib/storage";
import type { UndoRecord } from "@/shared/types";

const UNDO_TTL_MS = 15_000;
const ERROR_CLEAR_MS = 5_000;

function isZhLocale(): boolean {
  return navigator.language.startsWith("zh");
}

export interface ArchiveNotifyParams {
  bookmarkTitle: string;
  folderName: string;
  bookmarkId: string;
  originalParentId: string;
  targetParentId: string;
  originalTitle: string;
  renamedTitle?: string;
}

export function notifyArchiveSuccess(params: ArchiveNotifyParams): void {
  const notifId = generateId();
  const zh = isZhLocale();

  chrome.notifications.create(notifId, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title: zh ? "书签已归档" : "Bookmark Archived",
    message: `"${params.bookmarkTitle}" → ${params.folderName}`,
    buttons: [{ title: zh ? "撤回" : "Undo" }],
  });

  const record: UndoRecord = {
    bookmarkId: params.bookmarkId,
    notificationId: notifId,
    originalParentId: params.originalParentId,
    targetParentId: params.targetParentId,
    originalTitle: params.originalTitle,
    renamedTitle: params.renamedTitle,
    expiresAt: Date.now() + UNDO_TTL_MS,
  };
  saveUndoRecord(record);

  setTimeout(() => {
    chrome.notifications.clear(notifId);
    removeUndoRecord(notifId);
  }, UNDO_TTL_MS);
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
  setTimeout(() => chrome.notifications.clear(id), ERROR_CLEAR_MS);
}

async function saveUndoRecord(record: UndoRecord): Promise<void> {
  const records = (await storageGet("undo_records")) ?? [];
  records.push(record);
  await storageSet("undo_records", records);
}

async function removeUndoRecord(notificationId: string): Promise<void> {
  const records = (await storageGet("undo_records")) ?? [];
  const filtered = records.filter((r) => r.notificationId !== notificationId);
  if (filtered.length !== records.length) {
    await storageSet("undo_records", filtered);
  }
}

export async function findUndoRecord(notificationId: string): Promise<UndoRecord | undefined> {
  const records = (await storageGet("undo_records")) ?? [];
  return records.find((r) => r.notificationId === notificationId);
}

export async function clearExpiredUndoRecords(): Promise<void> {
  const records = (await storageGet("undo_records")) ?? [];
  const now = Date.now();
  const active = records.filter((r) => r.expiresAt > now);
  if (active.length !== records.length) {
    await storageSet("undo_records", active);
  }
}
