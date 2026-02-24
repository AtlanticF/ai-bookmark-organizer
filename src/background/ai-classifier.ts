import { chatCompletion } from "@/shared/lib/api-client";
import { buildTreeForPrompt } from "@/shared/lib/bookmark-tree";
import { isValidFolderPath } from "@/shared/lib/utils";
import type {
  ApiConfig,
  BatchClassificationItem,
  BookmarkAssessment,
  ChatMessage,
  ClassificationResponse,
  ContentExtractionResult,
  FolderNode,
  FolderStructureResponse,
  PruneCandidate,
} from "@/shared/types";

const INBOX_PATH = "00_📥_Inbox";

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  "zh-CN": "Chinese (Simplified)",
};

function langInstruction(locale: string): string {
  const name = LOCALE_NAMES[locale] ?? "English";
  return `\nIMPORTANT: All human-readable text in your response (reason, description, etc.) MUST be in ${name}.`;
}

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
   - Top-level prefixes are two-digit: 00, 01, 02, ..., 99
   - Subcategory prefixes: "{parent_number}.{sub_number}_{name}" (e.g., "10.1_AI", "10.2_Frontend")
3. MANDATORY FOLDERS:
   - "00_📥_Inbox" must always exist (buffer for uncertain items)
   - "99_💤_Archive" must always exist (cold storage)
4. EMOJI LABELS: Each top-level category gets one intuitive emoji.
5. SEMANTIC CLUSTERING: Group bookmarks by meaning, not by the user's original folder names.
6. HARD LIMITS (MUST obey):
   - MAXIMUM 10 top-level categories (including Inbox and Archive). Merge similar themes if needed.
   - MAXIMUM 5 subcategories per parent. Merge related topics if a parent would exceed 5 children.
7. SUBCATEGORIES: Only create subcategories when a category would contain 15+ bookmarks.

Respond ONLY with valid JSON. No explanations outside JSON.`;

const PRUNE_SYSTEM_PROMPT = `You are a bookmark cleanliness expert. Your job is to identify bookmarks that should be removed from the user's collection.

RULES:
1. DUPLICATES: Flag bookmarks that point to the same or very similar content/tools as other bookmarks in the list.
2. OUTDATED: Flag bookmarks to pages that are likely no longer available, or services that have been discontinued or superseded.
3. LOW VALUE: Flag bookmarks to temporary pages (search results, login pages, error pages, receipts, one-time confirmations, etc.) that have no long-term reference value.
4. BROKEN: Flag bookmarks with obviously malformed or broken URLs.
5. BE CONSERVATIVE: When in doubt, do NOT flag a bookmark. Only flag items you are reasonably confident about.

Respond ONLY with valid JSON. No explanations outside JSON.`;

const BATCH_CLASSIFY_SYSTEM_PROMPT = `You are a bookmark batch classification assistant. Your job is to classify MULTIPLE bookmarks into the best folders simultaneously.

RULES:
1. PREFER EXISTING FOLDERS: Always try to match an existing folder first.
2. NEW FOLDERS ALLOWED: If no existing folder fits well, you may suggest creating a new one.
   - New folders MUST follow the naming convention: "{number}_{emoji}_{name}"
3. INBOX FALLBACK: If you cannot determine a good category, route to "00_📥_Inbox".
4. CONFIDENCE SCORING: Rate your confidence from 0.0 to 1.0.
5. SUBCATEGORY ROUTING: Route to subcategories when appropriate.

Respond ONLY with valid JSON array. No explanations outside JSON.`;

const ASSESS_SYSTEM_PROMPT = `You are a bookmark quality advisor. Analyze whether a new bookmark is worth keeping based on the user's existing collection.

RULES:
1. DUPLICATE DETECTION: If the user already has bookmarks with very similar functionality or content, flag it.
2. TEMPORARY PAGES: Search results, login pages, error pages, and one-time-use URLs are NOT worth keeping.
3. VALUE ASSESSMENT: Consider if this bookmark provides long-term reference value.
4. SUGGEST FOLDER: If worth keeping, suggest the best existing folder.

Respond ONLY with valid JSON. No explanations outside JSON.`;

export async function classifyBookmark(
  bookmark: { title: string; url: string },
  content: ContentExtractionResult | null,
  folderTree: FolderNode[],
  config: ApiConfig,
  locale = "en",
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
    { role: "system", content: CLASSIFY_SYSTEM_PROMPT + langInstruction(locale) },
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

export async function batchClassifyBookmarks(
  bookmarks: { title: string; url: string }[],
  folderTree: FolderNode[],
  config: ApiConfig,
  locale = "en",
): Promise<BatchClassificationItem[]> {
  const treeText = buildTreeForPrompt(folderTree);
  const bookmarksJson = JSON.stringify(
    bookmarks.map((b) => ({ title: b.title, url: b.url })),
  );

  const userPrompt = `BOOKMARKS TO CLASSIFY:
${bookmarksJson}

CURRENT FOLDER STRUCTURE:
${treeText}

Classify each bookmark into the best folder. Respond with a JSON array, one entry per bookmark (same order):
[
  {
    "url": "https://example.com",
    "folder_path": "10_📚_Library/10.1_AI",
    "is_new_folder": false,
    "confidence": 0.85
  }
]`;

  const messages: ChatMessage[] = [
    { role: "system", content: BATCH_CLASSIFY_SYSTEM_PROMPT + langInstruction(locale) },
    { role: "user", content: userPrompt },
  ];

  try {
    const response = await chatCompletion(messages, config, {
      jsonMode: true,
      timeoutMs: null,
    });

    const parsed = extractJsonArrayFromResponse(response);
    if (!parsed) {
      return bookmarks.map((b) => ({
        url: b.url,
        folder_path: INBOX_PATH,
        is_new_folder: false,
        confidence: 0,
      }));
    }

    return bookmarks.map((bm, i) => {
      const item = parsed[i] as Record<string, unknown> | undefined;
      if (
        !item ||
        typeof item.folder_path !== "string" ||
        typeof item.confidence !== "number"
      ) {
        return {
          url: bm.url,
          folder_path: INBOX_PATH,
          is_new_folder: false,
          confidence: 0,
        };
      }
      const folderPath = isValidFolderPath(item.folder_path as string)
        ? (item.folder_path as string)
        : INBOX_PATH;
      return {
        url: bm.url,
        folder_path: (item.confidence as number) >= 0.5 ? folderPath : INBOX_PATH,
        is_new_folder: (item.is_new_folder as boolean) ?? false,
        confidence: item.confidence as number,
      };
    });
  } catch {
    return bookmarks.map((b) => ({
      url: b.url,
      folder_path: INBOX_PATH,
      is_new_folder: false,
      confidence: 0,
    }));
  }
}

export async function pruneBookmarks(
  bookmarks: { title: string; url: string }[],
  config: ApiConfig,
  locale = "en",
): Promise<PruneCandidate[]> {
  const bookmarksJson = JSON.stringify(
    bookmarks.map((b) => ({ title: b.title, url: b.url })),
  );

  const userPrompt = `Here are the user's bookmarks:

${bookmarksJson}

Identify bookmarks that should be removed. Respond with:
{
  "candidates": [
    {
      "url": "https://example.com",
      "title": "Example Page",
      "reason": "Brief explanation why this should be removed",
      "category": "duplicate"
    }
  ]
}

Categories: "duplicate", "outdated", "low_value", "broken".
If no bookmarks should be removed, return {"candidates": []}.`;

  const messages: ChatMessage[] = [
    { role: "system", content: PRUNE_SYSTEM_PROMPT + langInstruction(locale) },
    { role: "user", content: userPrompt },
  ];

  try {
    const response = await chatCompletion(messages, config, {
      jsonMode: true,
      timeoutMs: null,
    });
    const raw = extractJsonFromResponse(response);

    if (!raw || !Array.isArray(raw.candidates)) {
      return [];
    }

    return (raw.candidates as Record<string, unknown>[])
      .filter(
        (c) =>
          typeof c.url === "string" &&
          typeof c.title === "string" &&
          typeof c.reason === "string" &&
          typeof c.category === "string",
      )
      .map((c) => ({
        url: c.url as string,
        title: c.title as string,
        reason: c.reason as string,
        category: c.category as PruneCandidate["category"],
      }));
  } catch {
    return [];
  }
}

export async function generateFolderStructure(
  bookmarks: { title: string; url: string }[],
  config: ApiConfig,
  locale = "en",
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
    { role: "system", content: STRUCTURE_SYSTEM_PROMPT + langInstruction(locale) },
    { role: "user", content: userPrompt },
  ];

  const response = await chatCompletion(messages, config, {
    jsonMode: true,
    timeoutMs: null,
  });
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

  enforceFolderLimits(parsed);

  return parsed;
}

const MAX_TOP_LEVEL = 10;
const MAX_CHILDREN = 5;

function enforceFolderLimits(response: FolderStructureResponse): void {
  for (const folder of response.folders) {
    if (folder.children.length > MAX_CHILDREN) {
      folder.children = folder.children.slice(0, MAX_CHILDREN);
    }
  }

  if (response.folders.length > MAX_TOP_LEVEL) {
    const inbox = response.folders.find((f) => f.name.startsWith("00_"));
    const archive = response.folders.find((f) => f.name.startsWith("99_"));
    const rest = response.folders.filter(
      (f) => !f.name.startsWith("00_") && !f.name.startsWith("99_"),
    );

    const kept = rest.slice(0, MAX_TOP_LEVEL - 2);
    const merged = rest.slice(MAX_TOP_LEVEL - 2);

    if (inbox) {
      const extra = merged.reduce((s, f) => s + f.estimated_count, 0);
      inbox.estimated_count += extra;
    }

    response.folders = [
      ...(inbox ? [inbox] : []),
      ...kept,
      ...(archive ? [archive] : []),
    ];
  }
}

export async function assessBookmark(
  bookmark: { title: string; url: string },
  existingBookmarks: { title: string; url: string }[],
  folderTree: FolderNode[],
  config: ApiConfig,
  locale = "en",
): Promise<BookmarkAssessment> {
  const treeText = buildTreeForPrompt(folderTree);
  const sampledExisting = existingBookmarks.length > 100
    ? sampleArray(existingBookmarks, 100)
    : existingBookmarks;

  const userPrompt = `NEW BOOKMARK:
- Title: ${bookmark.title}
- URL: ${bookmark.url}

EXISTING BOOKMARKS (sample):
${JSON.stringify(sampledExisting.map((b) => ({ title: b.title, url: b.url })))}

CURRENT FOLDER STRUCTURE:
${treeText}

Assess this bookmark. Respond with:
{
  "isWorthKeeping": true,
  "reason": "Brief explanation",
  "confidence": 0.85,
  "suggestedFolder": "10_📚_Library",
  "similarExisting": ["Title of similar bookmark 1"]
}`;

  const messages: ChatMessage[] = [
    { role: "system", content: ASSESS_SYSTEM_PROMPT + langInstruction(locale) },
    { role: "user", content: userPrompt },
  ];

  try {
    const response = await chatCompletion(messages, config, true);
    const raw = extractJsonFromResponse(response);

    if (!raw || typeof raw.isWorthKeeping !== "boolean") {
      return {
        isWorthKeeping: true,
        reason: "Could not assess, keeping by default",
        confidence: 0.5,
        suggestedFolder: INBOX_PATH,
        similarExisting: [],
      };
    }

    return {
      isWorthKeeping: raw.isWorthKeeping as boolean,
      reason: (raw.reason as string) ?? "",
      confidence: (raw.confidence as number) ?? 0.5,
      suggestedFolder: (raw.suggestedFolder as string) ?? INBOX_PATH,
      similarExisting: Array.isArray(raw.similarExisting)
        ? (raw.similarExisting as string[])
        : [],
    };
  } catch {
    return {
      isWorthKeeping: true,
      reason: "Assessment failed, keeping by default",
      confidence: 0.5,
      suggestedFolder: INBOX_PATH,
      similarExisting: [],
    };
  }
}

export async function decideFolderMerge(
  groups: { prefix: string; folders: { title: string; bookmarkCount: number }[] }[],
  config: ApiConfig,
  locale = "en",
): Promise<{ prefix: string; keepTitle: string }[]> {
  const userPrompt = `The following folder groups have duplicate numeric prefixes. For each group, decide which folder name to KEEP (the best name that covers the broadest scope).

Groups:
${JSON.stringify(groups.map((g) => ({ prefix: g.prefix, folders: g.folders.map((f) => ({ title: f.title, bookmarks: f.bookmarkCount })) })))}

Respond with a JSON array:
[{ "prefix": "10", "keepTitle": "10_📚_Library" }]`;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a folder organization assistant. Pick the best folder name from each group of duplicate-prefix folders." +
        langInstruction(locale),
    },
    { role: "user", content: userPrompt },
  ];

  const fallback = groups.map((g) => ({
    prefix: g.prefix,
    keepTitle: g.folders.sort((a, b) => b.bookmarkCount - a.bookmarkCount)[0]!
      .title,
  }));

  try {
    const response = await chatCompletion(messages, config, true);
    const parsed = extractJsonArrayFromResponse(response);
    if (!parsed) return fallback;

    return parsed.map((item, i) => ({
      prefix: (item.prefix as string) ?? groups[i]!.prefix,
      keepTitle: (item.keepTitle as string) ?? fallback[i]!.keepTitle,
    }));
  } catch {
    return fallback;
  }
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

function extractJsonArrayFromResponse(text: string): Record<string, unknown>[] | null {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    return null;
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
        return null;
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
