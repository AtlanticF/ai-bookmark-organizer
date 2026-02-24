import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureInboxExists,
  initBookmarkListener,
  _handleBookmarkCreated,
  markAsMoving,
  unmarkAsMoving,
} from "../bookmark-listener";

vi.mock("../task-queue", () => ({
  enqueueTask: vi.fn().mockResolvedValue(undefined),
}));

let store: Record<string, unknown> = {};

const mockTree = [
  {
    id: "0",
    title: "",
    children: [
      {
        id: "1",
        title: "Bookmarks Bar",
        children: [
          { id: "10", title: "📥_Inbox", children: [] },
        ],
      },
      { id: "2", title: "Other Bookmarks", children: [] },
    ],
  },
] as chrome.bookmarks.BookmarkTreeNode[];

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
  vi.mocked(chrome.bookmarks.getTree).mockResolvedValue(mockTree);
  vi.mocked(chrome.bookmarks.move).mockResolvedValue({} as chrome.bookmarks.BookmarkTreeNode);
  vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({});

  vi.mocked(chrome.storage.local.get).mockImplementation(
    async (keys?: string | string[] | null) => {
      if (typeof keys === "string") return { [keys]: store[keys] };
      return store;
    },
  );
  vi.mocked(chrome.storage.local.set).mockImplementation(
    async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    },
  );
});

describe("ensureInboxExists", () => {
  it("returns existing inbox folder id", async () => {
    const id = await ensureInboxExists();
    expect(id).toBe("10");
    expect(chrome.bookmarks.create).not.toHaveBeenCalled();
  });

  it("creates inbox when missing", async () => {
    vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([
      {
        id: "0",
        title: "",
        children: [
          { id: "1", title: "Bookmarks Bar", children: [] },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    vi.mocked(chrome.bookmarks.create).mockResolvedValue({
      id: "new-inbox",
      title: "📥_Inbox",
    } as chrome.bookmarks.BookmarkTreeNode);

    const id = await ensureInboxExists();
    expect(id).toBe("new-inbox");
  });
});

describe("handleBookmarkCreated", () => {
  it("moves bookmark to Inbox and enqueues classification task", async () => {
    store.api_config = {
      baseUrl: "https://api.test.com/v1",
      apiKey: "test-key",
      model: "gpt-4o-mini",
    };

    await _handleBookmarkCreated("b1", {
      id: "b1",
      title: "Test Page",
      url: "https://test.com",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith("b1", {
      parentId: "10",
    });

    const { enqueueTask } = await import("../task-queue");
    expect(enqueueTask).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarkId: "b1",
        title: "Test Page",
        url: "https://test.com",
        status: "pending",
      }),
    );
  });

  it("skips folder bookmarks (no url)", async () => {
    await _handleBookmarkCreated("f1", {
      id: "f1",
      title: "New Folder",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
  });

  it("skips bookmarks marked as being moved by extension", async () => {
    markAsMoving("b2");
    await _handleBookmarkCreated("b2", {
      id: "b2",
      title: "Moving",
      url: "https://test.com",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
  });

  it("moves to Inbox but skips enqueue when API is not configured", async () => {
    await _handleBookmarkCreated("b4", {
      id: "b4",
      title: "No API",
      url: "https://test.com",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith("b4", {
      parentId: "10",
    });

    const { enqueueTask } = await import("../task-queue");
    expect(enqueueTask).not.toHaveBeenCalled();
  });
});

describe("markAsMoving / unmarkAsMoving", () => {
  it("prevents duplicate processing", async () => {
    markAsMoving("b5");
    await _handleBookmarkCreated("b5", {
      id: "b5",
      title: "Test",
      url: "https://test.com",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
    unmarkAsMoving("b5");
  });
});

describe("bookmark import detection", () => {
  beforeEach(() => {
    initBookmarkListener();
  });

  it("ignores bookmarks created during import", async () => {
    const importBegan = chrome.bookmarks.onImportBegan as unknown as {
      callListeners: () => void;
    };
    const importEnded = chrome.bookmarks.onImportEnded as unknown as {
      callListeners: () => void;
    };

    importBegan.callListeners();

    await _handleBookmarkCreated("b6", {
      id: "b6",
      title: "Imported Page",
      url: "https://imported.com",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).not.toHaveBeenCalled();

    importEnded.callListeners();

    await _handleBookmarkCreated("b7", {
      id: "b7",
      title: "Normal Page",
      url: "https://normal.com",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith("b7", {
      parentId: "10",
    });
  });
});
