import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useApiConfig } from "../use-api-config";

let store: Record<string, unknown> = {};

beforeEach(() => {
  store = {};
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
    },
  );
});

describe("useApiConfig", () => {
  it("returns empty config when storage is empty", async () => {
    const { result } = renderHook(() => useApiConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.config).toEqual({
      baseUrl: "",
      apiKey: "",
      model: "",
    });
  });

  it("loads and decrypts stored config", async () => {
    const { encrypt } = await import("@/shared/lib/crypto");
    const encryptedKey = await encrypt("sk-test-key");

    store["api_config"] = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: encryptedKey,
      model: "gpt-4o-mini",
    };

    const { result } = renderHook(() => useApiConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.config.baseUrl).toBe("https://api.openai.com/v1");
    expect(result.current.config.apiKey).toBe("sk-test-key");
    expect(result.current.config.model).toBe("gpt-4o-mini");
  });

  it("saveConfig encrypts API key and stores", async () => {
    const { result } = renderHook(() => useApiConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.saveConfig({
        baseUrl: "https://api.test.com/v1",
        apiKey: "my-secret-key",
        model: "gpt-4o",
      });
    });

    expect(result.current.config.apiKey).toBe("my-secret-key");

    const stored = store["api_config"] as { apiKey: string };
    expect(stored.apiKey).not.toBe("my-secret-key");
    expect(stored.apiKey.length).toBeGreaterThan(0);

    const { decrypt } = await import("@/shared/lib/crypto");
    const decrypted = await decrypt(stored.apiKey);
    expect(decrypted).toBe("my-secret-key");
  });

  it("handles empty API key", async () => {
    const { result } = renderHook(() => useApiConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.saveConfig({
        baseUrl: "https://api.test.com/v1",
        apiKey: "",
        model: "gpt-4o",
      });
    });

    const stored = store["api_config"] as { apiKey: string };
    expect(stored.apiKey).toBe("");
  });
});
