import { describe, it, expect, vi, beforeEach } from "vitest";
import { moveBookmark, batchMoveBookmarks } from "../bookmark-mover";
import type { BookmarkAssignment } from "../bookmark-mover";

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
          { id: "11", title: "🔥_Critical", children: [] },
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
  vi.mocked(chrome.bookmarks.move).mockResolvedValue(
    {} as chrome.bookmarks.BookmarkTreeNode,
  );
  vi.mocked(chrome.bookmarks.create).mockImplementation(
    async (arg) =>
      ({
        id: `created-${arg.title}`,
        title: arg.title ?? "",
      }) as chrome.bookmarks.BookmarkTreeNode,
  );

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

describe("moveBookmark", () => {
  it("moves bookmark to existing folder", async () => {
    const result = await moveBookmark(
      "b1",
      "🔥_Critical",
      false,
      "Test",
      "https://test.com",
      "📥_Inbox",
    );

    expect(result.success).toBe(true);
    expect(result.toFolder).toBe("🔥_Critical");
    expect(chrome.bookmarks.move).toHaveBeenCalledWith("b1", {
      parentId: "11",
    });
  });

  it("creates new folder when isNewFolder is true", async () => {
    const result = await moveBookmark(
      "b1",
      "🎨_Design",
      true,
      "Figma",
      "https://figma.com",
      "📥_Inbox",
    );

    expect(result.success).toBe(true);
    expect(chrome.bookmarks.create).toHaveBeenCalled();
  });

  it("updates archive history after move", async () => {
    await moveBookmark(
      "b1",
      "🔥_Critical",
      false,
      "Test",
      "https://test.com",
      "📥_Inbox",
    );

    const history = store["archive_history"] as unknown[];
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(
      expect.objectContaining({
        bookmarkId: "b1",
        toFolder: "🔥_Critical",
        fromFolder: "📥_Inbox",
      }),
    );
  });

  it("limits archive history to 50 entries", async () => {
    store["archive_history"] = Array.from({ length: 50 }, (_, i) => ({
      bookmarkId: `old-${i}`,
      title: `Old ${i}`,
      url: "https://old.com",
      fromFolder: "Inbox",
      toFolder: "Archive",
      timestamp: Date.now(),
    }));

    await moveBookmark(
      "b-new",
      "🔥_Critical",
      false,
      "New",
      "https://new.com",
      "📥_Inbox",
    );

    const history = store["archive_history"] as unknown[];
    expect(history).toHaveLength(50);
    expect((history[0] as { bookmarkId: string }).bookmarkId).toBe("b-new");
  });

  it("returns error on chrome API failure", async () => {
    vi.mocked(chrome.bookmarks.move).mockRejectedValue(
      new Error("Bookmark not found"),
    );

    const result = await moveBookmark(
      "b1",
      "🔥_Critical",
      false,
      "Test",
      "https://test.com",
      "📥_Inbox",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Bookmark not found");
  });
});

describe("batchMoveBookmarks", () => {
  it("moves all assignments and reports progress", async () => {
    const assignments: BookmarkAssignment[] = [
      {
        bookmarkId: "b1",
        title: "Test 1",
        url: "https://t1.com",
        fromFolder: "Inbox",
        targetFolderPath: "🔥_Critical",
        isNewFolder: false,
      },
      {
        bookmarkId: "b2",
        title: "Test 2",
        url: "https://t2.com",
        fromFolder: "Inbox",
        targetFolderPath: "🔥_Critical",
        isNewFolder: false,
      },
    ];

    const result = await batchMoveBookmarks(assignments);

    expect(result.total).toBe(2);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.status).toBe("done");
  });

  it("tracks failures in progress", async () => {
    vi.mocked(chrome.bookmarks.move)
      .mockResolvedValueOnce({} as chrome.bookmarks.BookmarkTreeNode)
      .mockRejectedValueOnce(new Error("Failed"));

    const assignments: BookmarkAssignment[] = [
      {
        bookmarkId: "b1",
        title: "OK",
        url: "https://ok.com",
        fromFolder: "Inbox",
        targetFolderPath: "🔥_Critical",
        isNewFolder: false,
      },
      {
        bookmarkId: "b2",
        title: "Fail",
        url: "https://fail.com",
        fromFolder: "Inbox",
        targetFolderPath: "🔥_Critical",
        isNewFolder: false,
      },
    ];

    const result = await batchMoveBookmarks(assignments);
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.status).toBe("done");
  });

  it("sets error status when all fail", async () => {
    vi.mocked(chrome.bookmarks.move).mockRejectedValue(
      new Error("All failed"),
    );

    const result = await batchMoveBookmarks([
      {
        bookmarkId: "b1",
        title: "Fail",
        url: "https://fail.com",
        fromFolder: "Inbox",
        targetFolderPath: "🔥_Critical",
        isNewFolder: false,
      },
    ]);

    expect(result.status).toBe("error");
  });
});
