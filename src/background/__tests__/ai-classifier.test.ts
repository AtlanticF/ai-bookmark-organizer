import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyBookmark,
  generateFolderStructure,
  extractJsonFromResponse,
  pruneBookmarks,
  batchClassifyBookmarks,
} from "../ai-classifier";
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
  { id: "10", name: "00_📥_Inbox", children: [] },
  {
    id: "11",
    name: "01_🔥_Critical",
    children: [{ id: "12", name: "01.1_Work", children: [] }],
  },
  {
    id: "13",
    name: "10_📚_Library",
    children: [{ id: "14", name: "10.1_AI", children: [] }],
  },
  { id: "15", name: "99_💤_Archive", children: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("classifyBookmark", () => {
  it("returns valid classification for high confidence response", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folder_path: "10_📚_Library/10.1_AI",
        is_new_folder: false,
        confidence: 0.92,
        reason: "AI-related content",
      }),
    );

    const result = await classifyBookmark(
      { title: "OpenAI docs", url: "https://openai.com" },
      { title: "OpenAI", description: "AI platform", summary: "AI tools" },
      folderTree,
      config,
    );

    expect(result.folder_path).toBe("10_📚_Library/10.1_AI");
    expect(result.confidence).toBe(0.92);
    expect(result.is_new_folder).toBe(false);
  });

  it("routes to Inbox when confidence < 0.5", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folder_path: "10_📚_Library",
        is_new_folder: false,
        confidence: 0.3,
        reason: "Low confidence guess",
      }),
    );

    const result = await classifyBookmark(
      { title: "Random", url: "https://example.com" },
      null,
      folderTree,
      config,
    );

    expect(result.folder_path).toBe("00_📥_Inbox");
  });

  it("returns Inbox on malformed JSON", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue("not json at all");

    const result = await classifyBookmark(
      { title: "Test", url: "https://test.com" },
      null,
      folderTree,
      config,
    );

    expect(result.folder_path).toBe("00_📥_Inbox");
    expect(result.confidence).toBe(0);
  });

  it("returns Inbox on API error", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockRejectedValue(new Error("Network error"));

    const result = await classifyBookmark(
      { title: "Test", url: "https://test.com" },
      null,
      folderTree,
      config,
    );

    expect(result.folder_path).toBe("00_📥_Inbox");
    expect(result.reason).toBe("Classification failed");
  });

  it("handles content extraction result", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folder_path: "01_🔥_Critical/01.1_Work",
        is_new_folder: false,
        confidence: 0.88,
        reason: "Work related",
      }),
    );

    const result = await classifyBookmark(
      { title: "Jira Board", url: "https://jira.com" },
      {
        title: "Jira",
        description: "Project management",
        summary: "Sprint board",
      },
      folderTree,
      config,
    );

    expect(result.folder_path).toBe("01_🔥_Critical/01.1_Work");
  });
});

describe("generateFolderStructure", () => {
  it("returns valid folder structure", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folders: [
          {
            name: "00_📥_Inbox",
            description: "Buffer",
            children: [],
            estimated_count: 0,
          },
          {
            name: "01_🔥_Critical",
            description: "Daily tools",
            children: [],
            estimated_count: 5,
          },
          {
            name: "99_💤_Archive",
            description: "Cold storage",
            children: [],
            estimated_count: 0,
          },
        ],
        total_bookmarks: 5,
        uncategorized_count: 0,
      }),
    );

    const bookmarks = [
      { title: "Gmail", url: "https://mail.google.com" },
      { title: "Github", url: "https://github.com" },
    ];

    const result = await generateFolderStructure(bookmarks, config);
    expect(result.folders.length).toBeGreaterThanOrEqual(3);
    expect(result.folders.some((f) => f.name.startsWith("00_"))).toBe(true);
    expect(result.folders.some((f) => f.name.startsWith("99_"))).toBe(true);
  });

  it("adds mandatory Inbox and Archive if missing", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folders: [
          {
            name: "01_🔥_Critical",
            description: "Daily",
            children: [],
            estimated_count: 5,
          },
        ],
        total_bookmarks: 5,
        uncategorized_count: 0,
      }),
    );

    const result = await generateFolderStructure(
      [{ title: "Test", url: "https://test.com" }],
      config,
    );

    expect(result.folders.some((f) => f.name.startsWith("00_"))).toBe(true);
    expect(result.folders.some((f) => f.name.startsWith("99_"))).toBe(true);
  });

  it("throws on invalid response", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue("invalid");

    await expect(
      generateFolderStructure(
        [{ title: "Test", url: "https://test.com" }],
        config,
      ),
    ).rejects.toThrow("Invalid folder structure response");
  });

  it("samples when >500 bookmarks", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folders: [
          { name: "00_📥_Inbox", description: "Buffer", children: [], estimated_count: 0 },
          { name: "99_💤_Archive", description: "Cold", children: [], estimated_count: 0 },
        ],
        total_bookmarks: 600,
        uncategorized_count: 0,
      }),
    );

    const bookmarks = Array.from({ length: 600 }, (_, i) => ({
      title: `Bookmark ${i}`,
      url: `https://example.com/${i}`,
    }));

    await generateFolderStructure(bookmarks, config);

    const calls = vi.mocked(chatCompletion).mock.calls;
    const userMsg = calls[0]?.[0]?.[1]?.content ?? "";
    const count = (userMsg.match(/"title":/g) ?? []).length;
    expect(count).toBeLessThanOrEqual(500);
    expect(count).toBeGreaterThan(0);
  });
});

describe("pruneBookmarks", () => {
  it("returns prune candidates from LLM response", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        candidates: [
          {
            url: "https://google.com/search?q=test",
            title: "Google Search",
            reason: "Temporary search result page",
            category: "low_value",
          },
        ],
      }),
    );

    const result = await pruneBookmarks(
      [
        { title: "Google Search", url: "https://google.com/search?q=test" },
        { title: "GitHub", url: "https://github.com" },
      ],
      config,
      "en",
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe("low_value");
  });

  it("returns empty array on invalid response", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue("not json");

    const result = await pruneBookmarks(
      [{ title: "Test", url: "https://test.com" }],
      config,
    );

    expect(result).toEqual([]);
  });

  it("returns empty array on API error", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockRejectedValue(new Error("fail"));

    const result = await pruneBookmarks(
      [{ title: "Test", url: "https://test.com" }],
      config,
    );

    expect(result).toEqual([]);
  });
});

describe("batchClassifyBookmarks", () => {
  it("returns classification for each bookmark", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify([
        { url: "https://openai.com", folder_path: "10_📚_Library/10.1_AI", is_new_folder: false, confidence: 0.9 },
        { url: "https://github.com", folder_path: "01_🔥_Critical", is_new_folder: false, confidence: 0.85 },
      ]),
    );

    const result = await batchClassifyBookmarks(
      [
        { title: "OpenAI", url: "https://openai.com" },
        { title: "GitHub", url: "https://github.com" },
      ],
      folderTree,
      config,
      "en",
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.folder_path).toBe("10_📚_Library/10.1_AI");
    expect(result[1]!.folder_path).toBe("01_🔥_Critical");
  });

  it("falls back to Inbox on API error", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockRejectedValue(new Error("fail"));

    const result = await batchClassifyBookmarks(
      [{ title: "Test", url: "https://test.com" }],
      folderTree,
      config,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.folder_path).toBe("00_📥_Inbox");
  });

  it("routes low confidence items to Inbox", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify([
        { url: "https://test.com", folder_path: "10_📚_Library", is_new_folder: false, confidence: 0.3 },
      ]),
    );

    const result = await batchClassifyBookmarks(
      [{ title: "Test", url: "https://test.com" }],
      folderTree,
      config,
    );

    expect(result[0]!.folder_path).toBe("00_📥_Inbox");
  });
});

describe("locale in prompts", () => {
  it("passes language instruction to system prompt for classify", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folder_path: "00_📥_Inbox",
        is_new_folder: false,
        confidence: 0.8,
        reason: "测试",
      }),
    );

    await classifyBookmark(
      { title: "Test", url: "https://test.com" },
      null,
      folderTree,
      config,
      "zh-CN",
    );

    const calls = vi.mocked(chatCompletion).mock.calls;
    const systemMsg = calls[0]?.[0]?.[0]?.content ?? "";
    expect(systemMsg).toContain("Chinese (Simplified)");
  });

  it("defaults to English when no locale specified", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folder_path: "00_📥_Inbox",
        is_new_folder: false,
        confidence: 0.8,
        reason: "test",
      }),
    );

    await classifyBookmark(
      { title: "Test", url: "https://test.com" },
      null,
      folderTree,
      config,
    );

    const calls = vi.mocked(chatCompletion).mock.calls;
    const systemMsg = calls[0]?.[0]?.[0]?.content ?? "";
    expect(systemMsg).toContain("English");
  });
});

describe("extractJsonFromResponse", () => {
  it("parses clean JSON", () => {
    const result = extractJsonFromResponse('{"key": "value"}');
    expect(result).toEqual({ key: "value" });
  });

  it("extracts JSON from markdown code block", () => {
    const result = extractJsonFromResponse(
      'Here is the result:\n```json\n{"key": "value"}\n```',
    );
    expect(result).toEqual({ key: "value" });
  });

  it("returns null for completely invalid text", () => {
    const result = extractJsonFromResponse("no json here at all");
    expect(result).toBeNull();
  });

  it("handles JSON with surrounding text", () => {
    const result = extractJsonFromResponse(
      'The classification is: {"folder_path": "01_🔥_Critical", "confidence": 0.9, "is_new_folder": false, "reason": "match"}',
    );
    expect(result).toEqual({
      folder_path: "01_🔥_Critical",
      confidence: 0.9,
      is_new_folder: false,
      reason: "match",
    });
  });
});
