import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/shared/i18n";
import App from "../App";
import type { ArchiveRecord } from "@/shared/types";

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
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        keys.forEach((k) => { result[k] = store[k]; });
        return result;
      }
      return store;
    },
  );

  vi.mocked(chrome.storage.local.set).mockImplementation(
    async (items: Record<string, unknown>) => {
      Object.assign(store, items);
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

function makeHistory(count: number): ArchiveRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    bookmarkId: `b${i}`,
    title: `Page ${i}`,
    url: `https://example.com/${i}`,
    fromFolder: "00_📥_Inbox",
    toFolder: `01_🔥_Critical`,
    timestamp: Date.now() - i * 1000,
  }));
}

describe("Popup Page", () => {
  it("shows unconfigured state when no API config", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/API Not Configured/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Open Settings/i })).toBeInTheDocument();
  });

  it("shows Idle status when API configured and queue empty", async () => {
    store["api_config"] = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Idle/i)).toBeInTheDocument();
    });
  });

  it("shows Processing status when queue has items", async () => {
    store["api_config"] = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    };
    store["task_queue"] = [
      {
        id: "t1",
        bookmarkId: "b1",
        title: "Test",
        url: "https://test.com",
        status: "pending",
        createdAt: Date.now(),
      },
      {
        id: "t2",
        bookmarkId: "b2",
        title: "Test 2",
        url: "https://test2.com",
        status: "classifying",
        createdAt: Date.now(),
      },
    ];

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Processing/i)).toBeInTheDocument();
    });
  });

  it("renders recent archive history entries", async () => {
    store["api_config"] = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    };
    store["archive_history"] = makeHistory(5);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Page 0")).toBeInTheDocument();
    });

    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(screen.getByText("Page 3")).toBeInTheDocument();
    expect(screen.getByText("Page 4")).toBeInTheDocument();
  });

  it("shows empty state message when no archive history", async () => {
    store["api_config"] = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/No recent archives/i)).toBeInTheDocument();
    });
  });

  it("Open Settings button calls chrome.runtime.openOptionsPage", async () => {
    store["api_config"] = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    };

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Open Settings/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Open Settings/i }));
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it("limits displayed history to 5 entries", async () => {
    store["api_config"] = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    };
    store["archive_history"] = makeHistory(10);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Page 0")).toBeInTheDocument();
    });

    expect(screen.getByText("Page 4")).toBeInTheDocument();
    expect(screen.queryByText("Page 5")).not.toBeInTheDocument();
  });
});
