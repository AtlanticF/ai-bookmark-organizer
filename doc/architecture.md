# Architecture — AI Bookmark Organizer

## 1. High-Level Architecture

```
┌───────────────────────────────────────────────────┐
│                 Chrome Extension                   │
├───────────┬───────────┬─────────────┬─────────────┤
│  Popup    │  Options  │ Onboarding  │  Content    │
│  Page     │  Page     │ Page        │  Script     │
│  (React)  │  (React)  │ (React)     │ (vanilla)   │
├───────────┴───────────┴─────────────┴─────────────┤
│           Background Service Worker                │
│  ┌────────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Bookmark   │ │  Task    │ │  AI Classifier   │ │
│  │  Listener   │ │  Queue   │ │                  │ │
│  └─────┬──────┘ └────┬─────┘ └────────┬─────────┘ │
│        │             │               │             │
│  ┌─────┴──────┐ ┌────┴─────┐ ┌───────┴──────────┐ │
│  │  Bookmark   │ │ Content  │ │  Notification    │ │
│  │  Mover      │ │ Extract  │ │  Manager         │ │
│  └────────────┘ └──────────┘ └──────────────────┘ │
├───────────────────────────────────────────────────┤
│  Chrome APIs: bookmarks, storage, notifications,  │
│  scripting, contextMenus, alarms, tabs            │
└─────────────────────┬─────────────────────────────┘
                      │ HTTP (user-configured)
              ┌───────┴───────┐
              │  LLM API      │
              │  (OpenAI-     │
              │  compatible)  │
              └───────────────┘
```

---

## 2. Module Responsibilities

### 2.1 Background Service Worker

The Service Worker is the central orchestrator. It has no DOM access and must persist all state to survive Chrome's automatic termination (after ~30s of inactivity).

#### Bookmark Listener (`bookmark-listener.ts`)

| Responsibility | Details |
|----------------|---------|
| Listen for new bookmarks | `chrome.bookmarks.onCreated` event handler |
| Debounce native dialog | Waits 5s after creation; resets on `onMoved`/`onChanged`; cancels on `onRemoved` |
| Enqueue for classification | After debounce, reads bookmark final state and pushes task into queue |
| Ensure Inbox exists | Creates `00_📥_Inbox` on startup if it doesn't exist |

#### Task Queue (`task-queue.ts`)

| Responsibility | Details |
|----------------|---------|
| FIFO processing | One task at a time, sequential execution |
| Persistence | Serialized to `chrome.storage.local` under key `task_queue` |
| Resilience | On Service Worker wake-up, checks for pending tasks and resumes |
| Status tracking | Each task has states: `pending` → `extracting` → `classifying` → `moving` → `done` / `error` |

**Task schema**:

```typescript
interface QueueTask {
  id: string;                    // UUID
  bookmarkId: string;            // chrome.bookmarks ID
  title: string;                 // bookmark title
  url: string;                   // bookmark URL
  status: 'pending' | 'extracting' | 'classifying' | 'moving' | 'done' | 'error';
  tabId?: number;                // source tab ID (for content extraction)
  content?: string;              // extracted page content
  targetFolder?: string;         // AI-determined folder path
  error?: string;                // error message if failed
  createdAt: number;             // timestamp
}
```

#### AI Classifier (`ai-classifier.ts`)

| Responsibility | Details |
|----------------|---------|
| Build prompts | Constructs system + user prompt from bookmark data + folder tree |
| Call LLM API | Uses `api-client.ts` for HTTP requests |
| Parse response | Extracts JSON from LLM response with validation |
| Confidence check | Routes to Inbox if confidence < 0.5 |
| Retry logic | Up to 2 retries on API failure or malformed response |

See [AI Prompts](ai-prompts.md) for prompt templates and classification strategy.

#### Content Extractor (`content-extractor.ts`)

| Responsibility | Details |
|----------------|---------|
| Request page content | Sends message to Content Script via `chrome.tabs.sendMessage` |
| Timeout handling | 5s timeout; falls back to URL + title only if content extraction fails |
| Content truncation | Limits extracted text to ~500 characters to control token usage |

#### Bookmark Mover (`bookmark-mover.ts`)

| Responsibility | Details |
|----------------|---------|
| Move bookmarks | `chrome.bookmarks.move()` to target folder |
| Create folders | `chrome.bookmarks.create()` for new categories (following prefix-code conventions) |
| Folder tree cache | Maintains a cached copy of the folder tree; invalidates on bookmark tree changes |

#### Notification Manager (`notification.ts`)

| Responsibility | Details |
|----------------|---------|
| Success notification | Chrome notification with "Undo" button; undo record persisted for 15s |
| Error notification | "⚠️ Failed to archive [bookmark title]" |
| Undo handling | On button click, moves bookmark back to original folder and restores title |

### 2.2 Content Script (`src/content/index.ts`)

Injected into all pages. Lightweight — only activates on message from background.

| Responsibility | Details |
|----------------|---------|
| Listen for extraction requests | `chrome.runtime.onMessage` handler for `EXTRACT_CONTENT` type |
| Extract metadata | `document.title`, `meta[name="description"]`, `meta[property="og:description"]` |
| Extract body summary | First ~500 characters of visible text content from `document.body` |
| Return data | Responds with `{ title, description, summary }` |

### 2.3 UI Pages

All three pages are React apps sharing components from `src/shared/`.

| Page | Entry | Key Components |
|------|-------|----------------|
| Popup | `src/popup/` | Status indicator, recent archive list, quick action buttons |
| Options | `src/options/` | API config form, connectivity test, re-archive trigger |
| Onboarding | `src/onboarding/` | Step wizard (4 steps), folder tree editor, progress display |

---

## 3. Communication Patterns

### 3.1 Background ↔ Content Script

```
Background Service Worker              Content Script (active tab)
        │                                        │
        │  chrome.tabs.sendMessage                │
        │  { type: "EXTRACT_CONTENT" }            │
        │ ──────────────────────────────────────▶  │
        │                                        │ Extracts:
        │                                        │  - document.title
        │                                        │  - meta description
        │                                        │  - og:description
        │                                        │  - body text (first 500 chars)
        │   { title, description, summary }      │
        │ ◀──────────────────────────────────────  │
        │       sendResponse()                    │
```

### 3.2 UI Pages ↔ Background

UI pages communicate with the Service Worker via `chrome.runtime.sendMessage` and also read shared state from `chrome.storage.local`.

```
UI Page (Popup / Options / Onboarding)
        │
        ├── chrome.storage.local.get()      → Read config, queue status, history
        ├── chrome.storage.onChanged         → Real-time updates when data changes
        └── chrome.runtime.sendMessage()     → Trigger actions:
              { type: "TEST_API_CONNECTION" }
              { type: "START_BULK_ARCHIVE", payload: { folderStructure } }
              { type: "RE_ARCHIVE_BOOKMARK", payload: { bookmarkId } }
```

### 3.3 Background ↔ LLM API

```
AI Classifier
        │
        │  POST ${baseUrl}/chat/completions
        │  Headers: { Authorization: Bearer ${apiKey} }
        │  Body: {
        │    model: ${model},
        │    messages: [system, user],
        │    response_format: { type: "json_object" }
        │  }
        │ ──────────────────────────────────────▶  LLM API
        │
        │  { choices: [{ message: { content: "{...}" } }] }
        │ ◀──────────────────────────────────────
        │
        │  Parse JSON → validate schema → return result
```

---

## 4. Data Flow: New Bookmark

```
                    ┌──────────┐
                    │  User    │
                    │  Ctrl+D  │
                    └────┬─────┘
                         │ chrome.bookmarks.onCreated
                         ▼
                ┌─────────────────┐
                │ Bookmark Listener│
                │ → Record pending│
                │ → Start 5s timer│
                └────────┬────────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
         onMoved    onChanged  onRemoved
         (reset     (reset      (cancel)
          2s)        2s)
              │          │
              └──────────┘
                         │ timer expires
                         ▼
                ┌─────────────────┐
                │ Get final state │
                │ → Enqueue task  │
                └────────┬────────┘
                         │ enqueue
                         ▼
                ┌─────────────────┐
                │   Task Queue    │──── persisted to storage
                └────────┬────────┘
                         │ dequeue (FIFO)
                         ▼
                ┌─────────────────┐      ┌─────────────────┐
                │Content Extractor│─────▶│  Content Script  │
                │ (background)    │◀─────│  (active tab)    │
                └────────┬────────┘      └─────────────────┘
                         │ { title, description, summary }
                         ▼
                ┌─────────────────┐      ┌─────────────────┐
                │  AI Classifier  │─────▶│    LLM API      │
                │  (build prompt) │◀─────│  (external)     │
                └────────┬────────┘      └─────────────────┘
                         │ { folder_path, is_new_folder, confidence }
                         ▼
                ┌─────────────────┐
                │ Bookmark Mover  │
                │ → Create folder?│
                │ → Move bookmark │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐      ┌─────────────────┐
                │  Notification   │─────▶│  Chrome System   │
                │  Manager        │      │  Notification    │
                │  (with Undo)    │      │  [Undo] button   │
                └────────┬────────┘      └─────────────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ Archive History │──── persisted to storage
                │ (last 50 items) │
                └─────────────────┘
```

---

## 5. Data Flow: Bulk Archive (Onboarding)

```
                    ┌──────────────┐
                    │  Onboarding  │
                    │  Step 4 UI   │
                    └──────┬───────┘
                           │ "Start bulk archive"
                           │ sendMessage({ type: "START_BULK_ARCHIVE" })
                           ▼
                  ┌──────────────────┐
                  │  Background SW   │
                  │  1. Backup HTML  │
                  │  2. Get all      │
                  │     bookmarks    │
                  └────────┬─────────┘
                           │ chrome.bookmarks.getTree()
                           ▼
                  ┌──────────────────┐      ┌─────────────┐
                  │  AI Classifier   │─────▶│  LLM API    │
                  │  (batch mode)    │◀─────│             │
                  │  process one by  │      └─────────────┘
                  │  one from queue  │
                  └────────┬─────────┘
                           │ results[]
                           ▼
                  ┌──────────────────┐
                  │  Bookmark Mover  │
                  │  (batch execute) │
                  └────────┬─────────┘
                           │ progress updates via storage
                           ▼
                  ┌──────────────────┐
                  │  Onboarding UI   │
                  │  (progress bar)  │
                  └──────────────────┘
```

---

## 6. Data Storage Schema

All data stored in `chrome.storage.local`:

| Key | Type | Description |
|-----|------|-------------|
| `api_config` | `ApiConfig` | API base URL, encrypted API key, model name |
| `task_queue` | `QueueTask[]` | Persisted FIFO task queue |
| `archive_history` | `ArchiveRecord[]` | Last 50 archive records for Popup display |
| `folder_tree_cache` | `FolderTreeCache` | Cached bookmark folder structure with timestamp |
| `onboarding_completed` | `boolean` | Whether first-install onboarding is done |
| `bulk_archive_progress` | `BulkProgress` | Progress state for bulk archive operation |
| `pending_debounce` | `PendingDebounceBookmark[]` | Bookmarks in debounce phase (SW restart recovery) |
| `undo_records` | `UndoRecord[]` | Recent archive undo data with 15s TTL |

```typescript
interface ApiConfig {
  baseUrl: string;
  apiKey: string;       // encrypted
  model: string;
}

interface ArchiveRecord {
  bookmarkId: string;
  title: string;
  url: string;
  fromFolder: string;
  toFolder: string;
  timestamp: number;
}

interface FolderTreeCache {
  tree: FolderNode[];
  lastUpdated: number;
}

interface FolderNode {
  id: string;
  title: string;
  children?: FolderNode[];
}

interface BulkProgress {
  total: number;
  completed: number;
  failed: number;
  status: 'idle' | 'running' | 'done' | 'error';
}

interface PendingDebounceBookmark {
  bookmarkId: string;
  url: string;
  title: string;
  createdAt: number;
}

interface UndoRecord {
  bookmarkId: string;
  notificationId: string;
  originalParentId: string;
  targetParentId: string;
  originalTitle: string;
  renamedTitle?: string;
  expiresAt: number;
}
```

---

## 7. Service Worker Lifecycle Management

Manifest V3 Service Workers are not persistent. Chrome terminates them after ~30s of inactivity.

### Strategy

| Concern | Solution |
|---------|----------|
| Queue interrupted | Queue persisted to `chrome.storage.local`; on wake-up, check for pending tasks |
| Periodic wake-up | `chrome.alarms.create("queue-check", { periodInMinutes: 0.5 })` |
| Alarm handler | On alarm, read queue from storage; if non-empty, process next task |
| Long operations | LLM API calls keep the Service Worker alive during execution; chain tasks to maintain activity |

### Wake-up Flow

```
chrome.alarms.onAlarm("queue-check")
  → Read task_queue from storage
  → If empty → do nothing, SW goes back to sleep
  → If non-empty → process next task → chain to next → ...
  → When queue empty → stop, SW goes back to sleep
```

---

## 8. Error Handling

| Error Scenario | Handling |
|----------------|----------|
| API connection failure | Retry up to 2 times with exponential backoff; on final failure, mark task as `error`, notify user |
| Malformed LLM response | Retry with same prompt; on 2nd failure, route to Inbox |
| Content Script timeout | Fall back to URL + title only classification |
| Bookmark already moved/deleted | Skip task, log warning, process next |
| Storage quota exceeded | Trim `archive_history` to last 20 items; warn in Popup |
| Inbox folder deleted by user | Re-create on next bookmark event |

---

## References

- [MVP Spec](mvp-spec.md) — Feature scope and user flows
- [Tech Stack](tech-stack.md) — Technology selection rationale
- [AI Prompts](ai-prompts.md) — Prompt design and classification logic
- [Project Structure](project-structure.md) — File layout
