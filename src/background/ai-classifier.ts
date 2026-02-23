import { chatCompletion } from "@/shared/lib/api-client";
import { buildTreeForPrompt } from "@/shared/lib/bookmark-tree";
import { isValidFolderPath } from "@/shared/lib/utils";
import type {
  ApiConfig,
  ChatMessage,
  ClassificationResponse,
  ContentExtractionResult,
  FolderNode,
  FolderStructureResponse,
} from "@/shared/types";

const INBOX_PATH = "00_📥_Inbox";

const CLASSIFY_SYSTEM_PROMPT = `You are a bookmark classification assistant. Your job is to determine the best folder for a given bookmark.

RULES:
1. PREFER EXISTING FOLDERS: Always try to match an existing folder first.
2. NEW FOLDERS ALLOWED: If no existing folder fits well, you may suggest creating a new one.
   - New folders MUST follow the naming convention: "{number}_{emoji}_{name}"
   - Choose a prefix number that makes sense in the existing sequence.
3. INBOX FALLBACK: If you cannot determine a good category with reasonable confidence, route to "00_📥_Inbox".
4. CONFIDENCE SCORING: Rate your confidence from 0.0 to 1.0.
   - 0.9-1.0: Perfect match to existing folder
   - 0.7-0.9: Good match, likely correct
   - 0.5-0.7: Uncertain, best guess
   - Below 0.5: Should go to Inbox
5. SUBCATEGORY ROUTING: If a bookmark clearly belongs to a subcategory, route directly there (e.g., "10_📚_Library/10.1_AI").

Respond ONLY with valid JSON. No explanations outside JSON.`;

const STRUCTURE_SYSTEM_PROMPT = `You are a bookmark directory architect. Your job is to analyze a user's existing bookmarks and design an optimal folder structure following these principles:

RULES:
1. FLAT STRUCTURE: Maximum 2 levels of depth (category → subcategory). Never go deeper.
2. PREFIX-CODED SORTING: Every folder name starts with a numeric prefix to control display order.
   - Format: "{number}_{emoji}_{name}" (e.g., "01_🔥_Critical")
   - Lower numbers = higher frequency / higher priority
3. MANDATORY FOLDERS:
   - "00_📥_Inbox" must always exist (buffer for uncertain items)
   - "99_💤_Archive" must always exist (cold storage)
4. EMOJI LABELS: Each top-level category gets one intuitive emoji.
5. SEMANTIC CLUSTERING: Group bookmarks by meaning, not by the user's original folder names.
6. REASONABLE GRANULARITY: Aim for 5-10 top-level categories. Avoid over-splitting.
7. SUBCATEGORIES: Only create subcategories when a category would contain 15+ bookmarks.
   Subcategory format: "{parent_number}.{sub_number}_{name}" (e.g., "10.1_AI", "10.2_Frontend")

Respond ONLY with valid JSON. No explanations outside JSON.`;

export async function classifyBookmark(
  bookmark: { title: string; url: string },
  content: ContentExtractionResult | null,
  folderTree: FolderNode[],
  config: ApiConfig,
): Promise<ClassificationResponse> {
  const treeText = buildTreeForPrompt(folderTree);
  const contentSummary = content
    ? `${content.description}\n${content.summary}`.trim()
    : "No page content available";

  const userPrompt = `BOOKMARK:
- Title: ${bookmark.title}
- URL: ${bookmark.url}
- Page Summary: ${contentSummary}

CURRENT FOLDER STRUCTURE:
${treeText}

Classify this bookmark into the best folder. Respond with:
{
  "folder_path": "10_📚_Library/10.1_AI",
  "is_new_folder": false,
  "confidence": 0.85,
  "reason": "Brief explanation of why this folder was chosen"
}`;

  const messages: ChatMessage[] = [
    { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  try {
    const response = await chatCompletion(messages, config, true);
    const raw = extractJsonFromResponse(response);

    if (!raw || !isClassificationResponse(raw)) {
      return defaultInboxResponse("Invalid response format");
    }

    const parsed = raw as unknown as ClassificationResponse;

    if (parsed.confidence < 0.5) {
      return { ...parsed, folder_path: INBOX_PATH };
    }

    if (!isValidFolderPath(parsed.folder_path)) {
      return { ...parsed, folder_path: INBOX_PATH };
    }

    return parsed;
  } catch {
    return defaultInboxResponse("Classification failed");
  }
}

export async function generateFolderStructure(
  bookmarks: { title: string; url: string }[],
  config: ApiConfig,
): Promise<FolderStructureResponse> {
  const sampled =
    bookmarks.length > 500
      ? sampleArray(bookmarks, 500)
      : bookmarks;

  const bookmarksJson = JSON.stringify(
    sampled.map((b) => ({ title: b.title, url: b.url })),
  );

  const userPrompt = `Here are all my current bookmarks (title and URL):

${bookmarksJson}

Based on these bookmarks, design an optimal folder structure.

Respond with this JSON schema:
{
  "folders": [
    {
      "name": "00_📥_Inbox",
      "description": "Buffer zone for uncertain classifications",
      "children": [],
      "estimated_count": 0
    }
  ],
  "total_bookmarks": ${bookmarks.length},
  "uncategorized_count": 0
}`;

  const messages: ChatMessage[] = [
    { role: "system", content: STRUCTURE_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const response = await chatCompletion(messages, config, true);
  const raw = extractJsonFromResponse(response);

  if (!raw || !isFolderStructureResponse(raw)) {
    throw new Error("Invalid folder structure response");
  }

  const parsed = raw as unknown as FolderStructureResponse;

  const hasInbox = parsed.folders.some((f) =>
    f.name.startsWith("00_"),
  );
  const hasArchive = parsed.folders.some((f) =>
    f.name.startsWith("99_"),
  );

  if (!hasInbox) {
    parsed.folders.unshift({
      name: INBOX_PATH,
      description: "Buffer zone for uncertain classifications",
      children: [],
      estimated_count: 0,
    });
  }

  if (!hasArchive) {
    parsed.folders.push({
      name: "99_💤_Archive",
      description: "Cold storage for completed projects",
      children: [],
      estimated_count: 0,
    });
  }

  return parsed;
}

export function extractJsonFromResponse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isClassificationResponse(
  obj: Record<string, unknown>,
): boolean {
  return (
    typeof obj.folder_path === "string" &&
    typeof obj.is_new_folder === "boolean" &&
    typeof obj.confidence === "number" &&
    typeof obj.reason === "string"
  );
}

function isFolderStructureResponse(
  obj: Record<string, unknown>,
): boolean {
  return (
    Array.isArray(obj.folders) &&
    obj.folders.length > 0 &&
    typeof obj.total_bookmarks === "number"
  );
}

function defaultInboxResponse(reason: string): ClassificationResponse {
  return {
    folder_path: INBOX_PATH,
    is_new_folder: false,
    confidence: 0,
    reason,
  };
}

function sampleArray<T>(arr: T[], size: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, size);
}
