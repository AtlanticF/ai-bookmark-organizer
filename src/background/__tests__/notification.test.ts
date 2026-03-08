import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyArchiveSuccess, notifyArchiveError } from "../notification";

const SUCCESS_PARAMS = {
  bookmarkTitle: "My Page",
  folderName: "01_🔥_Critical",
  bookmarkId: "b1",
  originalParentId: "p1",
  targetParentId: "p2",
  originalTitle: "My Page",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notifyArchiveSuccess", () => {
  it("creates chrome notification with correct params", () => {
    notifyArchiveSuccess(SUCCESS_PARAMS);

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: "basic",
        title: "Bookmark Archived",
        message: '"My Page" → 01_🔥_Critical',
      }),
    );
  });

  it("auto-clears notification after 15 seconds", () => {
    notifyArchiveSuccess(SUCCESS_PARAMS);

    expect(chrome.notifications.clear).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15_000);
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
