import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractContent } from "../content-extractor";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractContent", () => {
  it("returns extracted content on success", async () => {
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({
      title: "Test Page",
      description: "A description",
      summary: "Page content summary",
    });

    const result = await extractContent(42);
    expect(result).toEqual({
      title: "Test Page",
      description: "A description",
      summary: "Page content summary",
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
      type: "EXTRACT_CONTENT",
    });
  });

  it("truncates long content to 500 chars", async () => {
    const longText = "a".repeat(800);
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({
      title: "Test",
      description: longText,
      summary: longText,
    });

    const result = await extractContent(42);
    expect(result?.description.length).toBeLessThanOrEqual(503);
    expect(result?.summary.length).toBeLessThanOrEqual(503);
  });

  it("returns null when tab throws", async () => {
    vi.mocked(chrome.tabs.sendMessage).mockRejectedValue(
      new Error("No tab"),
    );

    const result = await extractContent(999);
    expect(result).toBeNull();
  });

  it("returns null on timeout", async () => {
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        title: "Late",
        description: "",
        summary: "",
      }), 10_000)),
    );

    vi.useFakeTimers();
    const promise = extractContent(42);
    vi.advanceTimersByTime(6_000);
    const result = await promise;
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it("returns null on non-object response", async () => {
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue(null);
    const result = await extractContent(42);
    expect(result).toBeNull();
  });
});
