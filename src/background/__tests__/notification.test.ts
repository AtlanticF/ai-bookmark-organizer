import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyArchiveSuccess, notifyArchiveError } from "../notification";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notifyArchiveSuccess", () => {
  it("creates chrome notification with correct params", () => {
    notifyArchiveSuccess("My Page", "01_🔥_Critical");

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: "basic",
        title: "Bookmark Archived",
        message: '"My Page" → 01_🔥_Critical',
      }),
    );
  });

  it("auto-clears notification after 5 seconds", () => {
    notifyArchiveSuccess("My Page", "01_🔥_Critical");

    expect(chrome.notifications.clear).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5_000);
    expect(chrome.notifications.clear).toHaveBeenCalled();
  });
});

describe("notifyArchiveError", () => {
  it("creates error notification", () => {
    notifyArchiveError("Bad Page", "Network error");

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: "basic",
        title: "Archive Failed",
        message: 'Failed to archive "Bad Page": Network error',
      }),
    );
  });

  it("auto-clears after 5 seconds", () => {
    notifyArchiveError("Bad Page", "Error");
    vi.advanceTimersByTime(5_000);
    expect(chrome.notifications.clear).toHaveBeenCalled();
  });
});
