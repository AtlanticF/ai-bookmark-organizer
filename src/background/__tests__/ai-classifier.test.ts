import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyBookmark,
  generateFolderStructure,
  extractJsonFromResponse,
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
