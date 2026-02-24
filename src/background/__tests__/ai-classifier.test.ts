import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyBookmark,
  generateFolderStructure,
  extractJsonFromResponse,
  pruneBookmarks,
  batchClassifyBookmarks,
  batchRenameBookmarks,
  stripNumericPrefix,
  deduplicateFolders,
  assignPrefixes,
  isInboxFolder,
  isArchiveFolder,
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
  { id: "10", name: "📥_Inbox", children: [] },
  {
    id: "11",
    name: "🔥_Critical",
    children: [{ id: "12", name: "Work", children: [] }],
  },
  {
    id: "13",
    name: "📚_Library",
    children: [{ id: "14", name: "AI", children: [] }],
  },
  { id: "15", name: "💤_Archive", children: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("classifyBookmark", () => {
  it("returns valid classification for high confidence response", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folder_path: "📚_Library/AI",
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

    expect(result.folder_path).toBe("📚_Library/AI");
    expect(result.confidence).toBe(0.92);
    expect(result.is_new_folder).toBe(false);
  });

  it("routes to Inbox when confidence < 0.5", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folder_path: "📚_Library",
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

    expect(result.folder_path).toBe("📥_Inbox");
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

    expect(result.folder_path).toBe("📥_Inbox");
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

    expect(result.folder_path).toBe("📥_Inbox");
    expect(result.reason).toBe("Classification failed");
  });

  it("handles content extraction result", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folder_path: "🔥_Critical/Work",
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

    expect(result.folder_path).toBe("🔥_Critical/Work");
  });
});

describe("generateFolderStructure", () => {
  it("returns valid folder structure with prefixes stripped", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folders: [
          { name: "📥_Inbox", description: "Buffer", children: [], estimated_count: 0 },
          { name: "🔥_Critical", description: "Daily tools", children: [], estimated_count: 5 },
          { name: "💤_Archive", description: "Cold storage", children: [], estimated_count: 0 },
        ],
        total_bookmarks: 5,
        uncategorized_count: 0,
      }),
    );

    const result = await generateFolderStructure(
      [{ title: "Gmail", url: "https://mail.google.com" }],
      config,
    );
    expect(result.folders.length).toBeGreaterThanOrEqual(3);
    expect(result.folders.some((f) => isInboxFolder(f.name))).toBe(true);
    expect(result.folders.some((f) => isArchiveFolder(f.name))).toBe(true);
    expect(result.folders.every((f) => !/^\d+_/.test(f.name))).toBe(true);
  });

  it("strips numeric prefixes from AI response", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folders: [
          { name: "00_📥_Inbox", description: "Buffer", children: [], estimated_count: 0 },
          { name: "01_🔥_Critical", description: "Daily", children: [{ name: "01.1_Work", description: "Work" }], estimated_count: 5 },
          { name: "99_💤_Archive", description: "Cold", children: [], estimated_count: 0 },

        ],
        total_bookmarks: 5,
        uncategorized_count: 0,
      }),
    );

    const result = await generateFolderStructure(
      [{ title: "Test", url: "https://test.com" }],
      config,
    );
    expect(result.folders[0]!.name).toBe("📥_Inbox");
    expect(result.folders[1]!.name).toBe("🔥_Critical");
    expect(result.folders[1]!.children[0]!.name).toBe("Work");
    expect(result.folders[2]!.name).toBe("💤_Archive");
  });

  it("deduplicates folders from AI response", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folders: [
          { name: "📥_Inbox", description: "Buffer", children: [], estimated_count: 0 },
          { name: "🔥_Critical", description: "Daily", children: [{ name: "PHP", description: "PHP" }], estimated_count: 5 },
          { name: "🔥_Critical", description: "Daily", children: [{ name: "PHP", description: "PHP" }, { name: "Go", description: "Go" }], estimated_count: 3 },
          { name: "💤_Archive", description: "Cold", children: [], estimated_count: 0 },
        ],
        total_bookmarks: 8,
        uncategorized_count: 0,
      }),
    );

    const result = await generateFolderStructure(
      [{ title: "Test", url: "https://test.com" }],
      config,
    );
    const criticals = result.folders.filter((f) => f.name.includes("Critical"));
    expect(criticals).toHaveLength(1);
    expect(criticals[0]!.estimated_count).toBe(8);
    expect(criticals[0]!.children).toHaveLength(2);
  });

  it("adds mandatory Inbox and Archive if missing", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folders: [
          { name: "🔥_Critical", description: "Daily", children: [], estimated_count: 5 },
        ],
        total_bookmarks: 5,
        uncategorized_count: 0,
      }),
    );

    const result = await generateFolderStructure(
      [{ title: "Test", url: "https://test.com" }],
      config,
    );

    expect(result.folders.some((f) => isInboxFolder(f.name))).toBe(true);
    expect(result.folders.some((f) => isArchiveFolder(f.name))).toBe(true);
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
          { name: "📥_Inbox", description: "Buffer", children: [], estimated_count: 0 },
          { name: "💤_Archive", description: "Cold", children: [], estimated_count: 0 },
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
        { url: "https://openai.com", folder_path: "📚_Library/AI", is_new_folder: false, confidence: 0.9 },
        { url: "https://github.com", folder_path: "🔥_Critical", is_new_folder: false, confidence: 0.85 },
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
    expect(result[0]!.folder_path).toBe("📚_Library/AI");
    expect(result[1]!.folder_path).toBe("🔥_Critical");
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
    expect(result[0]!.folder_path).toBe("📥_Inbox");
  });

  it("routes low confidence items to Inbox", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify([
        { url: "https://test.com", folder_path: "📚_Library", is_new_folder: false, confidence: 0.3 },
      ]),
    );

    const result = await batchClassifyBookmarks(
      [{ title: "Test", url: "https://test.com" }],
      folderTree,
      config,
    );

    expect(result[0]!.folder_path).toBe("📥_Inbox");
  });
});

describe("locale in prompts", () => {
  it("passes language instruction to system prompt for classify", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        folder_path: "📥_Inbox",
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
        folder_path: "📥_Inbox",
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

describe("batchRenameBookmarks", () => {
  it("returns renamed titles for each bookmark", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify([
        { url: "https://openai.com", newTitle: "[Tool] OpenAI Platform : API Access | OpenAI #ai" },
        { url: "https://github.com", newTitle: "[Tool] GitHub : Code Hosting | GitHub #dev" },
      ]),
    );

    const result = await batchRenameBookmarks(
      [
        { title: "OpenAI", url: "https://openai.com" },
        { title: "GitHub: Let's build from here", url: "https://github.com" },
      ],
      config,
      "en",
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.newTitle).toBe("[Tool] OpenAI Platform : API Access | OpenAI #ai");
    expect(result[1]!.newTitle).toBe("[Tool] GitHub : Code Hosting | GitHub #dev");
  });

  it("falls back to original title on API error", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockRejectedValue(new Error("fail"));

    const result = await batchRenameBookmarks(
      [{ title: "Test Page", url: "https://test.com" }],
      config,
      "en",
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.newTitle).toBe("Test Page");
    expect(result[0]!.url).toBe("https://test.com");
  });

  it("falls back to original title on invalid response", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue("not json");

    const result = await batchRenameBookmarks(
      [{ title: "My Page", url: "https://example.com" }],
      config,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.newTitle).toBe("My Page");
  });

  it("falls back for items with too-short newTitle", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify([
        { url: "https://test.com", newTitle: "ab" },
      ]),
    );

    const result = await batchRenameBookmarks(
      [{ title: "Original Title", url: "https://test.com" }],
      config,
    );

    expect(result[0]!.newTitle).toBe("Original Title");
  });

  it("strips surrounding quotes from newTitle", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify([
        { url: "https://test.com", newTitle: '"[Ref] Some Title | Site #tag"' },
      ]),
    );

    const result = await batchRenameBookmarks(
      [{ title: "Test", url: "https://test.com" }],
      config,
    );

    expect(result[0]!.newTitle).toBe("[Ref] Some Title | Site #tag");
  });

  it("passes locale instruction to system prompt", async () => {
    const { chatCompletion } = await import("@/shared/lib/api-client");
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify([
        { url: "https://test.com", newTitle: "[Ref] 测试 | Test #dev" },
      ]),
    );

    await batchRenameBookmarks(
      [{ title: "Test", url: "https://test.com" }],
      config,
      "zh-CN",
    );

    const calls = vi.mocked(chatCompletion).mock.calls;
    const systemMsg = calls[0]?.[0]?.[0]?.content ?? "";
    expect(systemMsg).toContain("Chinese (Simplified)");
  });
});

describe("stripNumericPrefix", () => {
  it("strips two-digit prefix", () => {
    expect(stripNumericPrefix("01_🔥_Critical")).toBe("🔥_Critical");
  });

  it("strips subcategory prefix", () => {
    expect(stripNumericPrefix("10.1_AI")).toBe("AI");
  });

  it("leaves non-prefixed name unchanged", () => {
    expect(stripNumericPrefix("🔥_Critical")).toBe("🔥_Critical");
  });

  it("strips zero prefix", () => {
    expect(stripNumericPrefix("00_📥_Inbox")).toBe("📥_Inbox");
  });
});

describe("deduplicateFolders", () => {
  it("merges duplicate top-level folders", () => {
    const result = deduplicateFolders([
      { name: "🔥_Critical", description: "A", children: [], estimated_count: 5 },
      { name: "🔥_Critical", description: "B", children: [], estimated_count: 3 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.estimated_count).toBe(8);
  });

  it("merges and deduplicates children", () => {
    const result = deduplicateFolders([
      { name: "📚_Library", description: "Lib", children: [{ name: "AI", description: "AI stuff" }], estimated_count: 5 },
      { name: "📚_Library", description: "Lib", children: [{ name: "AI", description: "AI stuff" }, { name: "Frontend", description: "FE" }], estimated_count: 3 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.children).toHaveLength(2);
    expect(result[0]!.children.map((c) => c.name)).toEqual(["AI", "Frontend"]);
  });

  it("is case-insensitive", () => {
    const result = deduplicateFolders([
      { name: "📚_Library", description: "A", children: [], estimated_count: 5 },
      { name: "📚_library", description: "B", children: [], estimated_count: 3 },
    ]);
    expect(result).toHaveLength(1);
  });

  it("preserves unique folders", () => {
    const result = deduplicateFolders([
      { name: "📥_Inbox", description: "Inbox", children: [], estimated_count: 0 },
      { name: "🔥_Critical", description: "Critical", children: [], estimated_count: 5 },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("assignPrefixes", () => {
  it("assigns 00 to Inbox, 99 to Archive, sequential to others", () => {
    const result = assignPrefixes([
      { name: "📥_Inbox", description: "", children: [], estimated_count: 0 },
      { name: "🔥_Critical", description: "", children: [], estimated_count: 5 },
      { name: "📚_Library", description: "", children: [], estimated_count: 10 },
      { name: "💤_Archive", description: "", children: [], estimated_count: 0 },
    ]);
    expect(result[0]!.name).toBe("00_📥_Inbox");
    expect(result[1]!.name).toBe("01_🔥_Critical");
    expect(result[2]!.name).toBe("02_📚_Library");
    expect(result[3]!.name).toBe("99_💤_Archive");

  });

  it("assigns child prefixes based on parent", () => {
    const result = assignPrefixes([
      { name: "📥_Inbox", description: "", children: [], estimated_count: 0 },
      { name: "📚_Library", description: "", children: [{ name: "AI", description: "" }, { name: "Frontend", description: "" }], estimated_count: 10 },
      { name: "💤_Archive", description: "", children: [], estimated_count: 0 },
    ]);
    expect(result[1]!.children[0]!.name).toBe("01.1_AI");
    expect(result[1]!.children[1]!.name).toBe("01.2_Frontend");
  });

  it("ensures Inbox first and Archive last regardless of input order", () => {
    const result = assignPrefixes([
      { name: "🔥_Critical", description: "", children: [], estimated_count: 5 },
      { name: "💤_Archive", description: "", children: [], estimated_count: 0 },
      { name: "📥_Inbox", description: "", children: [], estimated_count: 0 },
    ]);
    expect(result[0]!.name).toContain("📥_Inbox");
    expect(result[result.length - 1]!.name).toContain("💤_Archive");
  });

  it("strips existing prefixes before re-assigning", () => {
    const result = assignPrefixes([
      { name: "00_📥_Inbox", description: "", children: [], estimated_count: 0 },
      { name: "10_📚_Library", description: "", children: [{ name: "10.1_AI", description: "" }], estimated_count: 5 },
      { name: "99_💤_Archive", description: "", children: [], estimated_count: 0 },
    ]);
    expect(result[0]!.name).toBe("00_📥_Inbox");
    expect(result[1]!.name).toBe("01_📚_Library");
    expect(result[1]!.children[0]!.name).toBe("01.1_AI");
  });
});

describe("isInboxFolder / isArchiveFolder", () => {
  it("detects inbox by emoji", () => {
    expect(isInboxFolder("📥_Inbox")).toBe(true);
  });

  it("detects inbox by name", () => {
    expect(isInboxFolder("My Inbox")).toBe(true);
  });

  it("detects archive by emoji", () => {
    expect(isArchiveFolder("💤_Archive")).toBe(true);
  });

  it("rejects non-inbox", () => {
    expect(isInboxFolder("🔥_Critical")).toBe(false);
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
      'The classification is: {"folder_path": "🔥_Critical", "confidence": 0.9, "is_new_folder": false, "reason": "match"}',
    );
    expect(result).toEqual({
      folder_path: "🔥_Critical",
      confidence: 0.9,
      is_new_folder: false,
      reason: "match",
    });
  });
});
