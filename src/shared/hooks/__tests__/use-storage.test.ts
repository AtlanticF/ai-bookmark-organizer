import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useStorage } from "../use-storage";

let store: Record<string, unknown> = {};
let changeListeners: ((
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void)[] = [];

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

  vi.mocked(chrome.storage.local.set).mockImplementation(
    async (items: Record<string, unknown>) => {
      Object.assign(store, items);
      for (const [k, v] of Object.entries(items)) {
        changeListeners.forEach((l) =>
          l({ [k]: { newValue: v } }, "local"),
        );
      }
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

describe("useStorage", () => {
  it("returns default value initially while loading", () => {
    const { result } = renderHook(() =>
      useStorage("onboarding_completed", false),
    );

    expect(result.current[0]).toBe(false);
    expect(result.current[2]).toBe(true);
  });

  it("loads stored value after initialization", async () => {
    store["onboarding_completed"] = true;

    const { result } = renderHook(() =>
      useStorage("onboarding_completed", false),
    );

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    expect(result.current[0]).toBe(true);
  });

  it("setValue writes to storage and updates state", async () => {
    const { result } = renderHook(() =>
      useStorage("onboarding_completed", false),
    );

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    await act(async () => {
      await result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(store["onboarding_completed"]).toBe(true);
  });

  it("updates when storage changes externally", async () => {
    const { result } = renderHook(() =>
      useStorage("onboarding_completed", false),
    );

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    act(() => {
      changeListeners.forEach((l) =>
        l(
          { onboarding_completed: { newValue: true } },
          "local",
        ),
      );
    });

    expect(result.current[0]).toBe(true);
  });

  it("ignores changes from other storage areas", async () => {
    const { result } = renderHook(() =>
      useStorage("onboarding_completed", false),
    );

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    act(() => {
      changeListeners.forEach((l) =>
        l(
          { onboarding_completed: { newValue: true } },
          "sync",
        ),
      );
    });

    expect(result.current[0]).toBe(false);
  });
});
