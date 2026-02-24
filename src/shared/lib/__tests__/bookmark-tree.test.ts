import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  flattenBookmarks,
  findFolderByPath,
  ensureFolderExists,
  buildTreeForPrompt,
} from "../bookmark-tree";
import type { FolderNode } from "@/shared/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            title: "📥_Inbox",
            children: [],
          },
          {
            id: "20",
            title: "📚_Library",
            children: [
              {
                id: "21",
                title: "AI",
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
                title: "Frontend",
                children: [],
              },
            ],
          },
          {
            id: "30",
            title: "💤_Archive",
            children: [],
          },
          {
            id: "101",
            title: "Google",
            url: "https://google.com",
            parentId: "1",
          },
        ],
      },
      {
        id: "2",
        title: "Other Bookmarks",
        children: [
          {
            id: "102",
            title: "GitHub",
            url: "https://github.com",
            parentId: "2",
          },
        ],
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chrome.bookmarks.getTree).mockResolvedValue(mockTree as chrome.bookmarks.BookmarkTreeNode[]);
});

describe("flattenBookmarks", () => {
  it("extracts all leaf bookmarks from nested tree", () => {
    const result = flattenBookmarks(mockTree);
    expect(result).toHaveLength(3);
    expect(result.map((b) => b.title)).toEqual([
      "ChatGPT",
      "Google",
      "GitHub",
    ]);
  });

  it("includes url and parentId for each bookmark", () => {
    const result = flattenBookmarks(mockTree);
    const chatgpt = result.find((b) => b.title === "ChatGPT");
    expect(chatgpt).toMatchObject({
      id: "100",
      url: "https://chatgpt.com",
      parentId: "21",
    });
  });

  it("returns empty array for empty tree", () => {
    expect(flattenBookmarks([])).toEqual([]);
  });

  it("skips folders (nodes without url)", () => {
    const result = flattenBookmarks(mockTree);
    const folders = result.filter(
      (b) => !b.url,
    );
    expect(folders).toHaveLength(0);
  });
});

describe("findFolderByPath", () => {
  it("finds top-level folder", async () => {
    const id = await findFolderByPath("📥_Inbox");
    expect(id).toBe("10");
  });

  it("finds nested folder", async () => {
    const id = await findFolderByPath("📚_Library/AI");
    expect(id).toBe("21");
  });

  it("returns null for non-existent folder", async () => {
    const id = await findFolderByPath("🎨_Design");
    expect(id).toBeNull();
  });

  it("returns null for partially matching path", async () => {
    const id = await findFolderByPath("📚_Library/Missing");
    expect(id).toBeNull();
  });
});

describe("ensureFolderExists", () => {
  it("returns existing folder id without creating", async () => {
    const id = await ensureFolderExists("📥_Inbox");
    expect(id).toBe("10");
    expect(chrome.bookmarks.create).not.toHaveBeenCalled();
  });

  it("creates folder when it does not exist", async () => {
    vi.mocked(chrome.bookmarks.create).mockResolvedValue({
      id: "new-1",
      title: "🎨_Design",
      parentId: "1",
    } as chrome.bookmarks.BookmarkTreeNode);

    const id = await ensureFolderExists("🎨_Design");
    expect(id).toBe("new-1");
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: "1",
      title: "🎨_Design",
    });
  });

  it("creates nested folder chain", async () => {
    let callCount = 0;
    vi.mocked(chrome.bookmarks.create).mockImplementation(async (opts) => {
      callCount++;
      return {
        id: `new-${callCount}`,
        title: opts?.title ?? "",
        parentId: opts?.parentId ?? "0",
      } as chrome.bookmarks.BookmarkTreeNode;
    });

    const id = await ensureFolderExists("🎨_Design/UI");
    expect(chrome.bookmarks.create).toHaveBeenCalledTimes(2);
    expect(id).toBe("new-2");
  });
});

describe("buildTreeForPrompt", () => {
  it("formats flat folders", () => {
    const tree: FolderNode[] = [
      { id: "1", title: "📥_Inbox" },
      { id: "2", title: "🔥_Critical" },
    ];
    const result = buildTreeForPrompt(tree);
    expect(result).toBe("📥_Inbox\n🔥_Critical");
  });

  it("formats nested folders with indentation", () => {
    const tree: FolderNode[] = [
      {
        id: "1",
        title: "📚_Library",
        children: [
          { id: "2", title: "AI" },
          { id: "3", title: "Frontend" },
        ],
      },
    ];
    const result = buildTreeForPrompt(tree);
    expect(result).toBe(
      "📚_Library\n  AI\n  Frontend",
    );
  });

  it("skips nodes with empty title (no children)", () => {
    const tree: FolderNode[] = [
      { id: "0", title: "" },
      { id: "1", title: "📥_Inbox" },
    ];
    const result = buildTreeForPrompt(tree);
    expect(result).toBe("📥_Inbox");
  });

  it("recurses into children of empty-title nodes", () => {
    const tree: FolderNode[] = [
      {
        id: "0",
        title: "",
        children: [
          { id: "1", title: "📥_Inbox" },
          { id: "2", title: "📚_Library" },
        ],
      },
    ];
    const result = buildTreeForPrompt(tree);
    expect(result).toBe("📥_Inbox\n📚_Library");
  });

  it("returns empty string for empty tree", () => {
    expect(buildTreeForPrompt([])).toBe("");
  });
});
