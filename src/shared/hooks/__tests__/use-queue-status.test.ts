import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useQueueStatus } from "../use-queue-status";
import type { QueueTask } from "@/shared/types";

let store: Record<string, unknown> = {};
let changeListeners: ((
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void)[] = [];

function makeTask(overrides: Partial<QueueTask> = {}): QueueTask {
  return {
    id: "t1",
    bookmarkId: "b1",
    title: "Test",
    url: "https://test.com",
    status: "pending",
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  store = {};
  changeListeners = [];
  vi.clearAllMocks();

  vi.mocked(chrome.storage.local.get).mockImplementation(
    async (keys?: string | string[] | null) => {
      if (typeof keys === "string") return { [keys]: store[keys] };
      return store;
    },
  );

  (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => {
      changeListeners.push(cb);
    },
  );

  (chrome.storage.onChanged.removeListener as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => {
      changeListeners = changeListeners.filter((l) => l !== cb);
    },
  );
});

describe("useQueueStatus", () => {
  it("returns zeros when queue is empty", async () => {
    const { result } = renderHook(() => useQueueStatus());

    await waitFor(() => {
      expect(result.current.total).toBe(0);
    });

    expect(result.current.pending).toBe(0);
    expect(result.current.inProgress).toBe(0);
  });

  it("counts tasks by status", async () => {
    store["task_queue"] = [
      makeTask({ id: "t1", status: "pending" }),
      makeTask({ id: "t2", status: "classifying" }),
      makeTask({ id: "t3", status: "pending" }),
      makeTask({ id: "t4", status: "done" }),
      makeTask({ id: "t5", status: "extracting" }),
    ];

    const { result } = renderHook(() => useQueueStatus());

    await waitFor(() => {
      expect(result.current.total).toBe(5);
    });

    expect(result.current.pending).toBe(2);
    expect(result.current.inProgress).toBe(2);
  });

  it("updates when queue changes externally", async () => {
    const { result } = renderHook(() => useQueueStatus());

    await waitFor(() => {
      expect(result.current.total).toBe(0);
    });

    act(() => {
      changeListeners.forEach((l) =>
        l(
          {
            task_queue: {
              newValue: [
                makeTask({ id: "t1", status: "pending" }),
                makeTask({ id: "t2", status: "moving" }),
              ],
            },
          },
          "local",
        ),
      );
    });

    expect(result.current.total).toBe(2);
    expect(result.current.pending).toBe(1);
    expect(result.current.inProgress).toBe(1);
  });
});
