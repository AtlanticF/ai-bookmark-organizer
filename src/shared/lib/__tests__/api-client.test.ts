import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatCompletion, testConnection } from "../api-client";
import { ApiError } from "@/shared/types";
import type { ApiConfig } from "@/shared/types";

const config: ApiConfig = {
  baseUrl: "https://api.test.com/v1",
  apiKey: "sk-test-key",
  model: "gpt-4o-mini",
};

function mockFetchSuccess(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content } }],
      }),
  });
}

function mockFetchError(status: number, body = "") {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("chatCompletion", () => {
  it("sends correct request and returns content", async () => {
    globalThis.fetch = mockFetchSuccess('{"result": "test"}');

    const result = await chatCompletion(
      [{ role: "user", content: "Hello" }],
      config,
    );

    expect(result).toBe('{"result": "test"}');
    expect(fetch).toHaveBeenCalledWith(
      "https://api.test.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer sk-test-key",
        }),
      }),
    );

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse(calls[0]?.[1]?.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("strips trailing slashes from base URL", async () => {
    globalThis.fetch = mockFetchSuccess("ok");

    await chatCompletion(
      [{ role: "user", content: "test" }],
      { ...config, baseUrl: "https://api.test.com/v1///" },
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://api.test.com/v1/chat/completions",
      expect.anything(),
    );
  });

  it("enables JSON mode when requested", async () => {
    globalThis.fetch = mockFetchSuccess("{}");

    await chatCompletion(
      [{ role: "user", content: "test" }],
      config,
      true,
    );

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse(calls[0]?.[1]?.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("throws UNAUTHORIZED on 401", async () => {
    globalThis.fetch = mockFetchError(401);

    await expect(
      chatCompletion([{ role: "user", content: "test" }], config),
    ).rejects.toThrow(ApiError);

    await expect(
      chatCompletion([{ role: "user", content: "test" }], config),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("retries on 429 with exponential backoff", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: () => Promise.resolve("rate limited"),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "success" } }],
          }),
      });
    });

    const result = await chatCompletion(
      [{ role: "user", content: "test" }],
      config,
    );

    expect(result).toBe("success");
    expect(callCount).toBe(3);
  });

  it("throws SERVER_ERROR on 500", async () => {
    globalThis.fetch = mockFetchError(500, "Internal Server Error");

    await expect(
      chatCompletion([{ role: "user", content: "test" }], config),
    ).rejects.toMatchObject({ code: "SERVER_ERROR", status: 500 });
  });

  it("throws PARSE_ERROR when response has no content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: {} }] }),
    });

    await expect(
      chatCompletion([{ role: "user", content: "test" }], config),
    ).rejects.toMatchObject({ code: "PARSE_ERROR" });
  });

  it("throws NETWORK_ERROR on fetch failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      chatCompletion([{ role: "user", content: "test" }], config),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("throws TIMEOUT on abort", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const error = new DOMException("Aborted", "AbortError");
      return Promise.reject(error);
    });

    await expect(
      chatCompletion([{ role: "user", content: "test" }], config),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("testConnection", () => {
  it("returns true on success", async () => {
    globalThis.fetch = mockFetchSuccess("OK");

    const result = await testConnection(config);
    expect(result).toBe(true);
  });

  it("returns false on failure", async () => {
    globalThis.fetch = mockFetchError(401);

    const result = await testConnection(config);
    expect(result).toBe(false);
  });

  it("returns false on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await testConnection(config);
    expect(result).toBe(false);
  });
});
