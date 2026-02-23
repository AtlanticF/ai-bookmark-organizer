# AI Prompts — AI Bookmark Organizer

## 1. Overview

The extension uses two distinct prompt strategies for two scenarios:

| Scenario | Prompt Type | Input | Output |
|----------|-------------|-------|--------|
| **Bulk archive** (Onboarding Step 4) | Folder Structure Generator | All bookmarks [title, URL] | Proposed folder tree (JSON) |
| **Daily classification** (new bookmarks) | Single Bookmark Classifier | One bookmark + page content + current folders | Target folder path (JSON) |

Both prompts enforce JSON output via the `response_format: { type: "json_object" }` parameter.

---

## 2. Prompt 1: Folder Structure Generator

**Used in**: Onboarding Step 4 — AI proposes an initial folder structure based on all existing bookmarks.

### System Prompt

```
You are a bookmark directory architect. Your job is to analyze a user's existing bookmarks and design an optimal folder structure following these principles:

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

Respond ONLY with valid JSON. No explanations outside JSON.
```

### User Prompt

```
Here are all my current bookmarks (title and URL):

{bookmarks_json}

Based on these bookmarks, design an optimal folder structure.

Respond with this JSON schema:
{
  "folders": [
    {
      "name": "00_📥_Inbox",
      "description": "Buffer zone for uncertain classifications",
      "children": [],
      "estimated_count": 0
    },
    {
      "name": "01_🔥_Critical",
      "description": "Daily productivity essentials",
      "children": [],
      "estimated_count": 5
    }
  ],
  "total_bookmarks": 150,
  "uncategorized_count": 3
}
```

### Response Schema

```typescript
interface FolderStructureResponse {
  folders: ProposedFolder[];
  total_bookmarks: number;
  uncategorized_count: number;
}

interface ProposedFolder {
  name: string;          // e.g., "10_📚_Library"
  description: string;   // brief purpose description
  children: {
    name: string;        // e.g., "10.1_AI"
    description: string;
  }[];
  estimated_count: number;
}
```

### Validation Rules

- `folders` array must not be empty
- Must contain `00_📥_Inbox` and `99_💤_Archive`
- Every folder `name` must match pattern: `/^\d{2}_.*$/`
- `estimated_count` values should roughly sum to `total_bookmarks`

---

## 3. Prompt 2: Single Bookmark Classifier

**Used in**: Daily auto-archive flow and manual re-archive.

### System Prompt

```
You are a bookmark classification assistant. Your job is to determine the best folder for a given bookmark.

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

Respond ONLY with valid JSON. No explanations outside JSON.
```

### User Prompt

```
BOOKMARK:
- Title: {title}
- URL: {url}
- Page Summary: {content_summary}

CURRENT FOLDER STRUCTURE:
{folder_tree_json}

Classify this bookmark into the best folder. Respond with:
{
  "folder_path": "10_📚_Library/10.1_AI",
  "is_new_folder": false,
  "confidence": 0.85,
  "reason": "Brief explanation of why this folder was chosen"
}
```

### Response Schema

```typescript
interface ClassificationResponse {
  folder_path: string;    // e.g., "10_📚_Library/10.1_AI" or "03_🎨_Design" (new)
  is_new_folder: boolean; // true if this folder doesn't exist yet
  confidence: number;     // 0.0 to 1.0
  reason: string;         // brief justification
}
```

### Post-Processing Logic

```typescript
function processClassification(result: ClassificationResponse): string {
  // Route to Inbox if confidence is too low
  if (result.confidence < 0.5) {
    return "00_📥_Inbox";
  }

  // Validate folder_path format
  if (!isValidFolderPath(result.folder_path)) {
    return "00_📥_Inbox";
  }

  return result.folder_path;
}
```

---

## 4. Prompt Construction Helpers

### Building the Folder Tree for Prompts

```typescript
function buildFolderTreeForPrompt(): string {
  // Reads from folder_tree_cache in chrome.storage.local
  // Returns a simplified text representation:
  //
  // 00_📥_Inbox
  // 01_🔥_Critical
  // 02_🛠️_Tools
  // 10_📚_Library
  //   10.1_AI
  //   10.2_Frontend
  //   10.3_Backend
  // 20_📂_Projects
  // 99_💤_Archive
}
```

### Building the Bookmarks List for Bulk Prompt

```typescript
function buildBookmarksListForPrompt(
  bookmarks: chrome.bookmarks.BookmarkTreeNode[]
): string {
  // Returns JSON array of { title, url } objects
  // Filters out folders (only leaf bookmarks)
  // Truncates to avoid token limits:
  //   - If > 500 bookmarks, batch into multiple API calls
  //   - Each batch: up to 200 bookmarks
}
```

---

## 5. Token Budget Management

### Single Bookmark Classification

| Component | Estimated Tokens |
|-----------|-----------------|
| System prompt | ~200 |
| Folder tree (10 categories, 20 subcategories) | ~150 |
| Bookmark title + URL | ~30 |
| Page content summary (500 chars) | ~150 |
| Response | ~50 |
| **Total per classification** | **~580** |

### Bulk Folder Structure Generation

| Component | Estimated Tokens |
|-----------|-----------------|
| System prompt | ~250 |
| Bookmarks list (200 bookmarks × ~15 tokens each) | ~3000 |
| Response (folder structure) | ~500 |
| **Total per batch** | **~3750** |

For users with >200 bookmarks, the bulk operation is split into batches:
1. First batch: send all bookmarks → generate folder structure
2. If >500 bookmarks: send first 500 (randomly sampled) for structure generation
3. Subsequent batches: classify remaining bookmarks using the confirmed structure (uses Prompt 2)

---

## 6. Error Recovery

| Error | Recovery |
|-------|----------|
| LLM returns non-JSON | Extract JSON from response using regex `/\{[\s\S]*\}/`; retry if extraction fails |
| JSON doesn't match schema | Apply defaults: `folder_path = "00_📥_Inbox"`, `confidence = 0` |
| API timeout (>30s) | Retry once; on second timeout, mark task as error |
| API rate limit (429) | Exponential backoff: 2s → 4s → 8s; max 3 retries |
| Invalid folder_path format | Route to Inbox |

---

## 7. Model Recommendations

The extension works with any OpenAI-compatible API. Recommended models by use case:

| Model | Cost | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| gpt-4o-mini | Low | Fast | Good | Daily classification (default) |
| gpt-4o | Medium | Medium | Excellent | Bulk structure generation |
| deepseek-chat | Very Low | Fast | Good | Budget-conscious users |
| Local (Ollama) | Free | Varies | Varies | Privacy-maximizing users |

Users configure their preferred model in the Options page. The extension does not enforce model selection.

---

## References

- [Architecture](architecture.md) — How the AI Classifier module fits into the system
- [MVP Spec](mvp-spec.md) — Feature scope and user flows
