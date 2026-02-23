import type { ContentExtractionResult } from "@/shared/types";
import { truncateText } from "@/shared/lib/utils";

const EXTRACTION_TIMEOUT_MS = 5_000;
const MAX_CONTENT_LENGTH = 500;

export async function extractContent(
  tabId: number,
): Promise<ContentExtractionResult | null> {
  try {
    const result = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: "EXTRACT_CONTENT" }),
      timeout(EXTRACTION_TIMEOUT_MS),
    ]);

    if (!result || typeof result !== "object") return null;

    const { title, description, summary } = result as ContentExtractionResult;

    return {
      title: title ?? "",
      description: truncateText(description ?? "", MAX_CONTENT_LENGTH),
      summary: truncateText(summary ?? "", MAX_CONTENT_LENGTH),
    };
  } catch {
    return null;
  }
}

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}
