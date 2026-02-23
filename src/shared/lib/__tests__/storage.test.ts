import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  storageGet,
  storageSet,
  storageRemove,
  onStorageChanged,
  STORAGE_KEYS,
} from "../storage";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("STORAGE_KEYS", () => {
  it("contains all expected keys", () => {
    expect(STORAGE_KEYS.api_config).toBe("api_config");
    expect(STORAGE_KEYS.task_queue).toBe("task_queue");
    expect(STORAGE_KEYS.archive_history).toBe("archive_history");
    expect(STORAGE_KEYS.folder_tree_cache).toBe("folder_tree_cache");
    expect(STORAGE_KEYS.onboarding_completed).toBe("onboarding_completed");
    expect(STORAGE_KEYS.bulk_archive_progress).toBe("bulk_archive_progress");
  });
});

describe("storageGet", () => {
  it("returns value when key exists", async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      api_config: { baseUrl: "https://api.test.com", apiKey: "sk-123", model: "gpt-4o" },
    });

    const result = await storageGet("api_config");
    expect(result).toEqual({
      baseUrl: "https://api.test.com",
      apiKey: "sk-123",
      model: "gpt-4o",
    });
    expect(chrome.storage.local.get).toHaveBeenCalledWith("api_config");
  });

  it("returns undefined when key does not exist", async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({});

    const result = await storageGet("api_config");
    expect(result).toBeUndefined();
  });
});

describe("storageSet", () => {
  it("sets value in chrome.storage.local", async () => {
    await storageSet("onboarding_completed", true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      onboarding_completed: true,
    });
  });

  it("sets complex value", async () => {
    const queue = [
      {
        id: "1",
        bookmarkId: "b1",
        title: "Test",
        url: "https://test.com",
        status: "pending" as const,
        createdAt: Date.now(),
      },
    ];
    await storageSet("task_queue", queue);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      task_queue: queue,
    });
  });
});

describe("storageRemove", () => {
  it("removes key from storage", async () => {
    await storageRemove("api_config");
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("api_config");
  });
});

describe("onStorageChanged", () => {
  it("calls callback when watched key changes", () => {
    const callback = vi.fn();
    onStorageChanged("onboarding_completed", callback);

    const changes = {
      onboarding_completed: { newValue: true, oldValue: false },
    };
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock
      .calls[0]![0] as Function;
    listener(changes, "local");

    expect(callback).toHaveBeenCalledWith(true, false);
  });

  it("ignores changes to other keys", () => {
    const callback = vi.fn();
    onStorageChanged("onboarding_completed", callback);

    const changes = {
      api_config: { newValue: {}, oldValue: undefined },
    };
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock
      .calls[0]![0] as Function;
    listener(changes, "local");

    expect(callback).not.toHaveBeenCalled();
  });

  it("ignores changes from non-local storage areas", () => {
    const callback = vi.fn();
    onStorageChanged("onboarding_completed", callback);

    const changes = {
      onboarding_completed: { newValue: true, oldValue: false },
    };
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock
      .calls[0]![0] as Function;
    listener(changes, "sync");

    expect(callback).not.toHaveBeenCalled();
  });

  it("returns unsubscribe function", () => {
    const callback = vi.fn();
    const unsubscribe = onStorageChanged("onboarding_completed", callback);

    unsubscribe();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
  });
});
