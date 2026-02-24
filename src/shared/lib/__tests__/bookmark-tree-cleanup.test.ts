import { describe, it, expect, vi, beforeEach } from "vitest";
import { findEmptyFolders, removeFolders } from "../bookmark-tree";

const mockTree = [
  {
    id: "0",
    title: "",
    children: [
      {
        id: "1",
        title: "Bookmarks Bar",
        children: [
          {
            id: "10",
            title: "00_📥_Inbox",
            children: [],
          },
          {
            id: "20",
            title: "10_📚_Library",
            children: [
              {
                id: "21",
                title: "10.1_AI",
                children: [
                  {
                    id: "100",
                    title: "ChatGPT",
                    url: "https://chatgpt.com",
                    parentId: "21",
                  },
                ],
              },
              {
                id: "22",
                title: "10.2_Frontend",
                children: [],
              },
            ],
          },
          {
            id: "30",
            title: "99_💤_Archive",
            children: [],
          },
          {
            id: "40",
            title: "Old Folder",
            children: [],
          },
          {
            id: "50",
            title: "Another Empty",
            children: [],
          },
        ],
      },
    ],
  },
] as chrome.bookmarks.BookmarkTreeNode[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chrome.bookmarks.getTree).mockResolvedValue(mockTree);
});

describe("findEmptyFolders", () => {
  it("finds empty folders excluding specified prefixes", async () => {
    const result = await findEmptyFolders(["00_", "10_", "99_"]);

    const titles = result.map((f) => f.title);
    expect(titles).toContain("Old Folder");
    expect(titles).toContain("Another Empty");
    expect(titles).not.toContain("00_📥_Inbox");
    expect(titles).not.toContain("99_💤_Archive");
  });

  it("finds nested empty folders", async () => {
    const result = await findEmptyFolders(["00_", "99_"]);

    const titles = result.map((f) => f.title);
    expect(titles).toContain("10.2_Frontend");
    expect(titles).toContain("Old Folder");
    expect(titles).toContain("Another Empty");
  });

  it("does not include folders that contain bookmarks", async () => {
    const result = await findEmptyFolders([]);

    const titles = result.map((f) => f.title);
    expect(titles).not.toContain("10.1_AI");
  });

  it("returns empty array when no empty folders exist", async () => {
    vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([
      {
        id: "0",
        title: "",
        children: [
          {
            id: "1",
            title: "Bookmarks Bar",
            children: [
              {
                id: "10",
                title: "Folder With Bookmark",
                children: [
                  { id: "100", title: "Test", url: "https://test.com" },
                ],
              },
            ],
          },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    const result = await findEmptyFolders([]);
    expect(result).toHaveLength(0);
  });

  it("includes path in results", async () => {
    const result = await findEmptyFolders(["00_", "99_"]);

    const frontend = result.find((f) => f.title === "10.2_Frontend");
    expect(frontend?.path).toBe("10_📚_Library/10.2_Frontend");
  });
});

describe("removeFolders", () => {
  it("calls removeTree for each id", async () => {
    await removeFolders(["40", "50"]);

    expect(chrome.bookmarks.removeTree).toHaveBeenCalledTimes(2);
    expect(chrome.bookmarks.removeTree).toHaveBeenCalledWith("40");
    expect(chrome.bookmarks.removeTree).toHaveBeenCalledWith("50");
  });

  it("continues on error for individual folders", async () => {
    vi.mocked(chrome.bookmarks.removeTree)
      .mockRejectedValueOnce(new Error("Not found"))
      .mockResolvedValueOnce(undefined);

    await expect(removeFolders(["40", "50"])).resolves.not.toThrow();
    expect(chrome.bookmarks.removeTree).toHaveBeenCalledTimes(2);
  });

  it("handles empty array", async () => {
    await removeFolders([]);
    expect(chrome.bookmarks.removeTree).not.toHaveBeenCalled();
  });
});
