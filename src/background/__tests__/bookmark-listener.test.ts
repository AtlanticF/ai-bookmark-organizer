import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureInboxExists,
  _handleBookmarkCreated,
  markAsMoving,
  unmarkAsMoving,
} from "../bookmark-listener";

vi.mock("../task-queue", () => ({
  enqueueTask: vi.fn().mockResolvedValue(undefined),
}));

const mockTree = [
  {
    id: "0",
    title: "",
    children: [
      {
        id: "1",
        title: "Bookmarks Bar",
        children: [
          { id: "10", title: "00_📥_Inbox", children: [] },
        ],
      },
      { id: "2", title: "Other Bookmarks", children: [] },
    ],
  },
] as chrome.bookmarks.BookmarkTreeNode[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chrome.bookmarks.getTree).mockResolvedValue(mockTree);
  vi.mocked(chrome.bookmarks.move).mockResolvedValue({} as chrome.bookmarks.BookmarkTreeNode);
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
      title: "00_📥_Inbox",
    } as chrome.bookmarks.BookmarkTreeNode);

    const id = await ensureInboxExists();
    expect(id).toBe("new-inbox");
  });
});

describe("handleBookmarkCreated", () => {
  it("moves URL bookmark to Inbox and enqueues task", async () => {
    const { enqueueTask } = await import("../task-queue");

    await _handleBookmarkCreated("b1", {
      id: "b1",
      title: "Test Page",
      url: "https://test.com",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith("b1", {
      parentId: "10",
    });
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
    const { enqueueTask } = await import("../task-queue");

    await _handleBookmarkCreated("f1", {
      id: "f1",
      title: "New Folder",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it("skips bookmarks marked as being moved by extension", async () => {
    const { enqueueTask } = await import("../task-queue");

    markAsMoving("b2");
    await _handleBookmarkCreated("b2", {
      id: "b2",
      title: "Moving",
      url: "https://test.com",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it("skips bookmarks already in Inbox", async () => {
    const { enqueueTask } = await import("../task-queue");

    await _handleBookmarkCreated("b3", {
      id: "b3",
      title: "Already in Inbox",
      url: "https://test.com",
      parentId: "10",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
    expect(enqueueTask).not.toHaveBeenCalled();
  });
});

describe("markAsMoving / unmarkAsMoving", () => {
  it("prevents duplicate processing", async () => {
    const { enqueueTask } = await import("../task-queue");

    markAsMoving("b4");
    await _handleBookmarkCreated("b4", {
      id: "b4",
      title: "Test",
      url: "https://test.com",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    expect(enqueueTask).not.toHaveBeenCalled();
    unmarkAsMoving("b4");
  });
});
