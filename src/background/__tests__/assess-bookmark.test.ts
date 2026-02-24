import { describe, it, expect, vi, beforeEach } from "vitest";
import { assessBookmark } from "../ai-classifier";
import type { ApiConfig, FolderNode } from "@/shared/types";

vi.mock("@/shared/lib/api-client", () => ({
  chatCompletion: vi.fn(),
}));

const config: ApiConfig = {
  baseUrl: "https://api.test.com/v1",
  apiKey: "test-key",
  model: "gpt-4o-mini",
};

const folderTree: FolderNode[] = [
  { id: "10", title: "00_📥_Inbox" },
  { id: "11", title: "10_📚_Library", children: [{ id: "12", title: "10.1_AI" }] },
];

const existingBookmarks = [
  { title: "ChatGPT", url: "https://chatgpt.com" },
  { title: "Google", url: "https://google.com" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assessBookmark", () => {
  it("returns assessment when LLM responds with valid JSON", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        isWorthKeeping: true,
        reason: "Useful AI tool",
        confidence: 0.9,
        suggestedFolder: "10_📚_Library/10.1_AI",
        similarExisting: ["ChatGPT"],
      }),
    );

    const result = await assessBookmark(
      { title: "Claude", url: "https://claude.ai" },
      existingBookmarks,
      folderTree,
      config,
    );

    expect(result.isWorthKeeping).toBe(true);
    expect(result.confidence).toBe(0.9);
    expect(result.suggestedFolder).toBe("10_📚_Library/10.1_AI");
    expect(result.similarExisting).toContain("ChatGPT");
  });

  it("returns not worth keeping when LLM says so", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        isWorthKeeping: false,
        reason: "Temporary search result page",
        confidence: 0.85,
        suggestedFolder: "",
        similarExisting: [],
      }),
    );

    const result = await assessBookmark(
      { title: "Google Search", url: "https://google.com/search?q=test" },
      existingBookmarks,
      folderTree,
      config,
    );

    expect(result.isWorthKeeping).toBe(false);
    expect(result.reason).toBe("Temporary search result page");
  });

  it("defaults to keeping on invalid response", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue("not valid json at all");

    const result = await assessBookmark(
      { title: "Test", url: "https://test.com" },
      existingBookmarks,
      folderTree,
      config,
    );

    expect(result.isWorthKeeping).toBe(true);
    expect(result.suggestedFolder).toBe("00_📥_Inbox");
  });

  it("defaults to keeping on API error", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockRejectedValue(new Error("Network error"));

    const result = await assessBookmark(
      { title: "Test", url: "https://test.com" },
      existingBookmarks,
      folderTree,
      config,
    );

    expect(result.isWorthKeeping).toBe(true);
    expect(result.confidence).toBe(0.5);
  });

  it("samples existing bookmarks when >100", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        isWorthKeeping: true,
        reason: "OK",
        confidence: 0.8,
        suggestedFolder: "00_📥_Inbox",
        similarExisting: [],
      }),
    );

    const manyBookmarks = Array.from({ length: 200 }, (_, i) => ({
      title: `Bookmark ${i}`,
      url: `https://example.com/${i}`,
    }));

    await assessBookmark(
      { title: "Test", url: "https://test.com" },
      manyBookmarks,
      folderTree,
      config,
    );

    const calls = vi.mocked(chatCompletion).mock.calls;
    const userMsg = calls[0]?.[0]?.[1]?.content ?? "";
    const count = (userMsg.match(/"title":/g) ?? []).length;
    expect(count).toBeLessThanOrEqual(100);
  });
});
