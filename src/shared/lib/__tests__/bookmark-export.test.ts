import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportBookmarksAsHtml } from "../bookmark-export";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("exportBookmarksAsHtml", () => {
  it("generates valid Netscape Bookmark HTML", async () => {
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
                title: "Google",
                url: "https://google.com",
                dateAdded: 1700000000000,
              },
            ],
          },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    const html = await exportBookmarksAsHtml();

    expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
    expect(html).toContain("<TITLE>Bookmarks</TITLE>");
    expect(html).toContain("<H1>Bookmarks</H1>");
    expect(html).toContain('<A HREF="https://google.com"');
    expect(html).toContain("Google</A>");
    expect(html).toContain('ADD_DATE="1700000000"');
  });

  it("handles nested folders", async () => {
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
                title: "Dev",
                children: [
                  {
                    id: "11",
                    title: "GitHub",
                    url: "https://github.com",
                  },
                ],
              },
            ],
          },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    const html = await exportBookmarksAsHtml();

    expect(html).toContain("<H3>Bookmarks Bar</H3>");
    expect(html).toContain("<H3>Dev</H3>");
    expect(html).toContain("GitHub</A>");
  });

  it("escapes special characters in titles and URLs", async () => {
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
                title: 'Test & <b>"Page"</b>',
                url: "https://example.com?a=1&b=2",
              },
            ],
          },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    const html = await exportBookmarksAsHtml();

    expect(html).toContain("Test &amp; &lt;b&gt;&quot;Page&quot;&lt;/b&gt;");
    expect(html).toContain("https://example.com?a=1&amp;b=2");
  });

  it("returns empty string when tree is empty", async () => {
    vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([]);

    const html = await exportBookmarksAsHtml();
    expect(html).toBe("");
  });
});
