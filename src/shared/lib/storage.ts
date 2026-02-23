import type { StorageSchema } from "@/shared/types";

export const STORAGE_KEYS: Record<keyof StorageSchema, keyof StorageSchema> = {
  api_config: "api_config",
  task_queue: "task_queue",
  archive_history: "archive_history",
  folder_tree_cache: "folder_tree_cache",
  onboarding_completed: "onboarding_completed",
  bulk_archive_progress: "bulk_archive_progress",
} as const;

export async function storageGet<K extends keyof StorageSchema>(
  key: K,
): Promise<StorageSchema[K] | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as StorageSchema[K] | undefined;
}

export async function storageSet<K extends keyof StorageSchema>(
  key: K,
  value: StorageSchema[K],
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function storageRemove<K extends keyof StorageSchema>(
  key: K,
): Promise<void> {
  await chrome.storage.local.remove(key);
}

export function onStorageChanged<K extends keyof StorageSchema>(
  key: K,
  callback: (
    newValue: StorageSchema[K] | undefined,
    oldValue: StorageSchema[K] | undefined,
  ) => void,
): () => void {
  const listener = (
    changes: { [k: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area !== "local") return;
    if (!(key in changes)) return;
    const change = changes[key]!;
    callback(
      change.newValue as StorageSchema[K] | undefined,
      change.oldValue as StorageSchema[K] | undefined,
    );
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
