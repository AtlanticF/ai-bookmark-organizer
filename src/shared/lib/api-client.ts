import type { ApiConfig, ChatMessage } from "@/shared/types";
import { ApiError } from "@/shared/types";
import { sleep } from "./utils";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

export interface ChatCompletionOptions {
  jsonMode?: boolean;
  timeoutMs?: number | null;
}

export async function chatCompletion(
  messages: ChatMessage[],
  config: ApiConfig,
  options?: boolean | ChatCompletionOptions,
): Promise<string> {
  const opts: ChatCompletionOptions =
    typeof options === "boolean" ? { jsonMode: options } : (options ?? {});
  const { jsonMode = false, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = timeoutMs
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: timeoutMs ? controller.signal : undefined,
      });

      if (timeout) clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw mapHttpError(response.status, errorBody);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (typeof content !== "string") {
        throw new ApiError("Empty response from LLM", "PARSE_ERROR");
      }

      return content;
    } catch (error) {
      if (error instanceof ApiError) {
        lastError = error;
        if (error.code === "RATE_LIMITED") {
          const delay = Math.pow(2, attempt) * 1000;
          await sleep(delay);
          continue;
        }
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("Request timed out", "TIMEOUT");
      }

      throw new ApiError(
        error instanceof Error ? error.message : "Network error",
        "NETWORK_ERROR",
      );
    }
  }

  throw lastError ?? new ApiError("Max retries exceeded", "RATE_LIMITED", 429);
}

export async function testConnection(config: ApiConfig): Promise<boolean> {
  try {
    await chatCompletion(
      [{ role: "user", content: "Reply with OK" }],
      config,
    );
    return true;
  } catch {
    return false;
  }
}

function mapHttpError(status: number, body: string): ApiError {
  switch (status) {
    case 401:
      return new ApiError("Invalid API key", "UNAUTHORIZED", 401);
    case 429:
      return new ApiError("Rate limited", "RATE_LIMITED", 429);
    default:
      if (status >= 500) {
        return new ApiError(
          `Server error: ${body.slice(0, 200)}`,
          "SERVER_ERROR",
          status,
        );
      }
      return new ApiError(
        `HTTP ${status}: ${body.slice(0, 200)}`,
        "UNKNOWN",
        status,
      );
  }
}
