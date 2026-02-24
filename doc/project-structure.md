# Project Structure — AI Bookmark Organizer

## Directory Layout

```
ai-bookmark-organizer/
├── AGENTS.md                          # Agent rules and project conventions
├── doc/                               # Project documentation
│   ├── README.md                      # Documentation index
│   ├── mvp-spec.md                    # MVP product specification
│   ├── tech-stack.md                  # Technology selection rationale
│   ├── architecture.md                # System architecture design
│   ├── ai-prompts.md                  # AI prompt templates and strategy
│   └── project-structure.md           # This file
├── public/
│   ├── icons/                         # Extension icons
│   │   ├── icon-16.png
│   │   ├── icon-32.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── _locales/                      # Chrome built-in i18n (extension name/description)
│       ├── en/
│       │   └── messages.json
│       └── zh_CN/
│           └── messages.json
├── src/
│   ├── manifest.ts                    # Manifest V3 config (compiled by @crxjs/vite-plugin)
│   ├── background/                    # Service Worker (no DOM access)
│   │   ├── index.ts                   # SW entry: registers listeners, alarms, context menus
│   │   ├── bookmark-listener.ts       # chrome.bookmarks.onCreated handler
│   │   ├── task-queue.ts              # FIFO queue with chrome.storage persistence
│   │   ├── ai-classifier.ts          # Prompt building + LLM response parsing
│   │   ├── content-extractor.ts       # Sends message to content script, handles timeout
│   │   ├── bookmark-mover.ts          # Bookmark move/create-folder operations
│   │   └── notification.ts            # Chrome system notifications
│   ├── content/
│   │   └── index.ts                   # Content Script: DOM extraction on message
│   ├── popup/                         # Extension popup (click icon)
│   │   ├── index.html                 # HTML entry point
│   │   ├── main.tsx                   # React mount point
│   │   └── App.tsx                    # Status + recent archives + quick actions
│   ├── options/                       # Settings page (standalone tab)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx                    # API config form + connectivity test
│   ├── onboarding/                    # First-install wizard (standalone tab)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx                    # Step wizard container
│   │   └── steps/
│   │       ├── StepApiConfig.tsx      # Step 1: API base URL, key, model
│   │       ├── StepConnTest.tsx       # Step 2: connectivity test
│   │       ├── StepModeSelect.tsx     # Step 3: archive mode selection
│   │       └── StepBulkArchive.tsx    # Step 4: backup, AI structure, execute
│   └── shared/                        # Code shared across all pages
│       ├── components/
│       │   └── ui/                    # shadcn/ui generated components
│       │       ├── button.tsx
│       │       ├── input.tsx
│       │       ├── card.tsx
│       │       ├── toast.tsx
│       │       ├── progress.tsx
│       │       └── ...
│       ├── hooks/
│       │   ├── use-storage.ts         # React hook for chrome.storage with real-time updates
│       │   ├── use-queue-status.ts    # React hook for task queue state
│       │   └── use-api-config.ts      # React hook for API configuration
│       ├── lib/
│       │   ├── storage.ts             # chrome.storage.local wrapper (typed get/set)
│       │   ├── api-client.ts          # OpenAI-compatible API client (fetch-based)
│       │   ├── bookmark-tree.ts       # Bookmark tree traversal and manipulation utilities
│       │   ├── crypto.ts              # API key encryption/decryption helpers
│       │   └── utils.ts               # General utilities (UUID, debounce, etc.)
│       ├── i18n/
│       │   ├── index.ts               # i18next initialization and config
│       │   ├── en.json                # English translations
│       │   └── zh-CN.json             # Simplified Chinese translations
│       └── types/
│           └── index.ts               # Shared TypeScript type definitions
├── components.json                    # shadcn/ui configuration
├── tailwind.config.ts                 # Tailwind CSS configuration
├── tsconfig.json                      # TypeScript configuration (strict mode)
├── vite.config.ts                     # Vite + @crxjs/vite-plugin configuration
├── package.json
├── pnpm-lock.yaml
└── .gitignore
```

---

## File Responsibilities

### `src/background/` — Service Worker

| File | Responsibility | Key APIs Used |
|------|---------------|---------------|
| `index.ts` | Entry point. Registers all event listeners, alarms, and context menus on install/startup | `chrome.runtime.onInstalled`, `chrome.alarms.create`, `chrome.contextMenus.create` |
| `bookmark-listener.ts` | Debounces new bookmark events (5s), monitors `onMoved`/`onChanged`/`onRemoved`, enqueues classification task after stabilization | `chrome.bookmarks.onCreated`, `chrome.bookmarks.onMoved`, `chrome.bookmarks.onChanged`, `chrome.bookmarks.onRemoved` |
| `task-queue.ts` | FIFO queue implementation. Persists to storage. Resumes on SW wake-up. Processes one task at a time | `chrome.storage.local`, `chrome.alarms.onAlarm` |
| `ai-classifier.ts` | Builds prompts from bookmark data + folder tree. Calls LLM API. Parses and validates JSON responses | `api-client.ts` (internal) |
| `content-extractor.ts` | Requests page content from Content Script. Handles timeout (5s). Falls back to URL+title | `chrome.tabs.sendMessage` |
| `bookmark-mover.ts` | Moves bookmarks to target folder. Creates new folders if needed. Maintains folder tree cache | `chrome.bookmarks.move`, `chrome.bookmarks.create` |
| `notification.ts` | Sends Chrome notifications with Undo button for archive results; manages undo records | `chrome.notifications.create`, `chrome.notifications.onButtonClicked` |

### `src/content/` — Content Script

| File | Responsibility | Key APIs Used |
|------|---------------|---------------|
| `index.ts` | Listens for `EXTRACT_CONTENT` message. Extracts title, meta tags, and body text summary. Returns data to background | `chrome.runtime.onMessage`, DOM APIs |

### `src/popup/` — Popup Page

| File | Responsibility |
|------|---------------|
| `index.html` | HTML shell with React mount point |
| `main.tsx` | React app initialization (i18n, render) |
| `App.tsx` | Main UI: API status dot, queue status, last 5 archives list, "Settings" and "Inbox" buttons |

### `src/options/` — Options Page

| File | Responsibility |
|------|---------------|
| `index.html` | HTML shell with React mount point |
| `main.tsx` | React app initialization |
| `App.tsx` | Settings form: API base URL, API key (masked), model name, test button, re-archive trigger |

### `src/onboarding/` — Onboarding Page

| File | Responsibility |
|------|---------------|
| `index.html` | HTML shell with React mount point |
| `main.tsx` | React app initialization |
| `App.tsx` | Step wizard container: manages current step, navigation, shared state between steps |
| `steps/StepApiConfig.tsx` | Step 1: API configuration form (reuses Options page logic) |
| `steps/StepConnTest.tsx` | Step 2: sends test API call, shows success/failure |
| `steps/StepModeSelect.tsx` | Step 3: two cards — "Keep existing" vs "Full re-organization" |
| `steps/StepBulkArchive.tsx` | Step 4: backup button, AI structure proposal, editable folder tree, progress bar, execute |

### `src/shared/` — Shared Code

| File | Responsibility |
|------|---------------|
| `components/ui/*.tsx` | shadcn/ui components (generated via `npx shadcn@latest add`) |
| `hooks/use-storage.ts` | React hook wrapping `chrome.storage.local` with `onChanged` listener for real-time updates |
| `hooks/use-queue-status.ts` | Reads `task_queue` from storage, returns `{ total, pending, processing }` |
| `hooks/use-api-config.ts` | Reads/writes `api_config` from storage |
| `lib/storage.ts` | Typed wrapper around `chrome.storage.local.get/set`. Single source of truth for storage keys |
| `lib/api-client.ts` | `async function chatCompletion(messages, config): Promise<string>` — handles fetch, auth header, error mapping |
| `lib/bookmark-tree.ts` | `getTree()`, `findFolder()`, `flattenBookmarks()`, `buildTreeForPrompt()` |
| `lib/crypto.ts` | Simple encrypt/decrypt for API key storage (using Web Crypto API) |
| `lib/utils.ts` | `cn()` (Tailwind class merge), `generateId()`, `truncateText()` |
| `i18n/index.ts` | i18next init: language detection, fallback to `en`, loads JSON resources |
| `i18n/en.json` | English translation strings |
| `i18n/zh-CN.json` | Chinese translation strings |
| `types/index.ts` | Shared interfaces: `ApiConfig`, `QueueTask`, `ArchiveRecord`, `ClassificationResponse`, etc. |

### Root Config Files

| File | Purpose |
|------|---------|
| `src/manifest.ts` | Manifest V3 definition (TypeScript object, compiled by @crxjs/vite-plugin) |
| `vite.config.ts` | Vite config with @crxjs/vite-plugin, multi-page entry points |
| `tailwind.config.ts` | Tailwind content paths, shadcn/ui theme extensions |
| `tsconfig.json` | TypeScript strict mode, path aliases (`@/` → `src/`) |
| `components.json` | shadcn/ui component generation config (alias paths, style preferences) |
| `.gitignore` | `node_modules/`, `dist/`, `.env` |

---

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Directories | kebab-case | `src/shared/hooks/` |
| React components | PascalCase | `StepApiConfig.tsx` |
| Utility files | kebab-case | `api-client.ts`, `bookmark-tree.ts` |
| Type files | kebab-case | `types/index.ts` |
| i18n keys | dot-notation | `popup.status.idle`, `onboarding.step1.title` |
| CSS classes | Tailwind utilities | (no custom CSS files needed) |

---

## Path Aliases

Configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

Usage:

```typescript
import { Button } from "@/shared/components/ui/button";
import { useStorage } from "@/shared/hooks/use-storage";
import { chatCompletion } from "@/shared/lib/api-client";
import type { QueueTask } from "@/shared/types";
```

---

## References

- [Tech Stack](tech-stack.md) — Why these tools were chosen
- [Architecture](architecture.md) — How modules interact
- [MVP Spec](mvp-spec.md) — What features each module implements
