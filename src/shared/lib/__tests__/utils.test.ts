import { describe, it, expect } from "vitest";
import { cn, generateId, truncateText, isValidFolderPath } from "../utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("deduplicates tailwind conflicts", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });
});

describe("generateId", () => {
  it("returns a string", () => {
    expect(typeof generateId()).toBe("string");
  });

  it("returns unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it("matches UUID v4 format", () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("truncateText", () => {
  it("returns text unchanged if shorter than max", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("returns text unchanged if exactly max length", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("truncates with ellipsis if longer than max", () => {
    expect(truncateText("hello world", 5)).toBe("hello…");
  });

  it("handles empty string", () => {
    expect(truncateText("", 5)).toBe("");
  });
});

describe("isValidFolderPath", () => {
  it("validates single folder", () => {
    expect(isValidFolderPath("01_🔥_Critical")).toBe(true);
  });

  it("validates nested path", () => {
    expect(isValidFolderPath("10_📚_Library/10.1_AI")).toBe(true);
  });

  it("validates inbox", () => {
    expect(isValidFolderPath("00_📥_Inbox")).toBe(true);
  });

  it("rejects paths without numeric prefix", () => {
    expect(isValidFolderPath("Library")).toBe(false);
  });

  it("rejects paths with single digit prefix", () => {
    expect(isValidFolderPath("1_Bad")).toBe(false);
  });

  it("validates archive", () => {
    expect(isValidFolderPath("99_💤_Archive")).toBe(true);
  });
});
