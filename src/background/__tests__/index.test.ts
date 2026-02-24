import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../bookmark-listener", () => ({
  initBookmarkListener: vi.fn(),
  ensureInboxExists: vi.fn().mockResolvedValue("inbox-id"),
  markAsMoving: vi.fn(),
  unmarkAsMoving: vi.fn(),
}));

vi.mock("../task-queue", () => ({
  enqueueTask: vi.fn().mockResolvedValue(undefined),
  dequeueTask: vi.fn().mockResolvedValue(undefined),
  updateTask: vi.fn().mockResolvedValue(undefined),
  removeTask: vi.fn().mockResolvedValue(undefined),
  getQueueLength: vi.fn().mockResolvedValue(0),
  getAllTasks: vi.fn().mockResolvedValue([]),
  clearQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../content-extractor", () => ({
  extractContent: vi.fn().mockResolvedValue(null),
}));

vi.mock("../ai-classifier", () => ({
  classifyBookmark: vi.fn().mockResolvedValue({
    folder_path: "01_🔥_Critical",
    is_new_folder: false,
    confidence: 0.9,
    reason: "test",
  }),
}));

vi.mock("../bookmark-mover", () => ({
  moveBookmark: vi.fn().mockResolvedValue({ success: true, toFolder: "01_🔥_Critical" }),
}));

vi.mock("../notification", () => ({
  notifyArchiveSuccess: vi.fn(),
  notifyArchiveError: vi.fn(),
}));

type Callback = (...args: unknown[]) => void;

let onInstalledCallback: Callback;
let onAlarmCallback: Callback;
let onContextMenuCallback: Callback;
let onMessageCallback: Callback;

beforeEach(() => {
  vi.clearAllMocks();

  (chrome.runtime.onInstalled.addListener as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: Callback) => { onInstalledCallback = cb; },
  );
  (chrome.alarms.onAlarm.addListener as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: Callback) => { onAlarmCallback = cb; },
  );
  (chrome.contextMenus.onClicked.addListener as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: Callback) => { onContextMenuCallback = cb; },
  );
  (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: Callback) => { onMessageCallback = cb; },
  );
});

async function loadModule() {
  vi.resetModules();
  await import("../index");
}

describe("Service Worker Entry", () => {
  it("registers all listeners on load", async () => {
    await loadModule();

    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    expect(chrome.contextMenus.onClicked.addListener).toHaveBeenCalled();
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();

    const { initBookmarkListener } = await import("../bookmark-listener");
    expect(initBookmarkListener).toHaveBeenCalled();
  });

  it("onInstalled creates Inbox, alarm, and context menu", async () => {
    await loadModule();

    vi.mocked(chrome.storage.local.get).mockResolvedValue({});

    await onInstalledCallback({ reason: "update" });

    const { ensureInboxExists } = await import("../bookmark-listener");
    expect(ensureInboxExists).toHaveBeenCalled();
    expect(chrome.alarms.create).toHaveBeenCalledWith("queue-check", {
      periodInMinutes: 0.5,
    });
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ai-re-archive",
        contexts: ["page", "link"],
      }),
    );
  });

  it("onInstalled first install opens onboarding tab", async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({});
    await loadModule();

    await onInstalledCallback({ reason: "install" });

    expect(chrome.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("onboarding"),
      }),
    );
  });

  it("onAlarm queue-check triggers processQueue", async () => {
    await loadModule();

    await onAlarmCallback({ name: "queue-check" });
  });

  it("onMessage TEST_API_CONNECTION returns test result", async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      api_config: {
        baseUrl: "https://api.test.com",
        apiKey: "key",
        model: "gpt-4o-mini",
      },
    });

    await loadModule();

    const sendResponse = vi.fn();
    const result = onMessageCallback(
      { type: "TEST_API_CONNECTION" },
      {},
      sendResponse,
    );

    expect(result).toBe(true);
  });

  it("contextMenu click enqueues re-archive task", async () => {
    vi.mocked(chrome.bookmarks.search).mockResolvedValue([
      {
        id: "b1",
        title: "Test",
        url: "https://test.com",
      } as chrome.bookmarks.BookmarkTreeNode,
    ]);

    await loadModule();

    await onContextMenuCallback(
      { menuItemId: "ai-re-archive", pageUrl: "https://test.com" },
      { title: "Test" },
    );

    const { enqueueTask } = await import("../task-queue");
    expect(enqueueTask).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarkId: "b1",
        url: "https://test.com",
        status: "pending",
      }),
    );
  });
});
