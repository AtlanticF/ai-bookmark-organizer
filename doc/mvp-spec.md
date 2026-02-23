# MVP Spec — AI Bookmark Organizer

## 1. Product Positioning

**One-liner**: A Chrome extension that leverages user-provided LLM services to automatically organize bookmarks into a semantically structured, flat directory system following best practices.

**Core selling points**:

1. **Zero migration cost** — Operates directly on Chrome native bookmarks, no third-party platform
2. **AI-native semantic classification** — True content understanding, not keyword matching
3. **Privacy-first, no subscription** — Users bring their own OpenAI-compatible API

**Target users**: Technical users and knowledge workers who have access to self-hosted or subscribed LLM APIs.

**MVP completion bar**: Core flows functional and usable. UI can be rough. No Chrome Web Store polish required.

---

## 2. Page Architecture

| Page | Type | Trigger |
|------|------|---------|
| **Popup** | Extension popup | Click extension icon |
| **Options Page** | Standalone tab | Popup entry / Right-click extension → Options |
| **Onboarding Page** | Standalone tab | Auto-opens on first install |

---

## 3. Core Flows

### Flow 1: First-Install Onboarding

```
Install extension
  → Auto-open Onboarding tab
  → Step 1: Configure API (base URL / API Key / model)
  → Step 2: Connectivity test (send one API call to verify)
  → Step 3: Choose archive mode
      ├─ Mode A: "Keep existing structure" → only applies to future bookmarks
      └─ Mode B: "Full re-organization" → proceed to Step 4
  → Step 4 (Mode B only):
      → Auto-backup current bookmarks (export as HTML download)
      → AI scans all bookmarks (URL + title only)
      → AI generates recommended folder structure
        (follows flat + prefix-coded best practices)
      → User reviews and edits the proposed structure
      → User confirms → batch classification executes
      → Display progress and result summary
  → Done, enter daily usage
```

### Flow 2: Daily New-Bookmark Auto-Archive

```
User presses Ctrl+D to add bookmark
  → chrome.bookmarks.onCreated fires
  → Bookmark auto-moved to Inbox folder
  → Enters processing queue
  → Content Script extracts current tab content
      (title + meta description + body summary)
  → Call LLM API with:
      - Bookmark URL, title, page content summary
      - Current folder structure (as classification options)
  → LLM returns:
      - Target folder path (existing or suggest new)
  → Move bookmark to target folder
      (create folder if it doesn't exist, following prefix-code conventions)
  → Chrome system notification: "🔖 Archived to [01_🔥_Critical]"
  → Process next item in queue
```

### Flow 3: Manual Re-Archive

```
Right-click a bookmark → "AI Re-archive this bookmark"
  → Enters processing queue (same as Flow 2, but uses fetch for content)
```

---

## 4. Page Designs

### 4.1 Popup

| Zone | Content |
|------|---------|
| **Status bar** | API connection status (green/red dot) + queue status ("Idle" / "Processing 2/5") |
| **Recent archives** | Last 5 archive records: bookmark title → target folder |
| **Quick actions** | "Open Settings" button, "Open Inbox" button |

### 4.2 Options Page

| Config Item | Type | Description |
|-------------|------|-------------|
| API Base URL | Text input | e.g., `https://api.openai.com/v1` |
| API Key | Password input | Stored locally with encryption |
| Model name | Text input / dropdown | e.g., `gpt-4o-mini` |
| Connectivity test | Button | Sends one test request |
| Re-run full archive | Button | Redirects to Onboarding Step 4 |

### 4.3 Onboarding Page

Step-by-step wizard UI (Steps 1–4 as described in Flow 1).

**Step 4 — Folder Structure Editor** key interactions:

- AI-generated folder tree displayed as an editable list
- User can: rename folders, delete categories, add categories, drag to reorder
- Each category shows estimated bookmark count (preview)
- "Confirm & Execute" button at the bottom

---

## 5. Bookmark Organization Best Practices

These principles are embedded into the AI classification logic:

| Principle | Description |
|-----------|-------------|
| **Flat over deep** | Max 2 levels of nesting (category → subcategory) |
| **Prefix-coded sorting** | Numeric prefixes control display order; high-frequency categories get lower numbers |
| **Inbox philosophy** | `00_📥_Inbox` always exists as a buffer for uncertain classifications |
| **Archive cold storage** | `99_💤_Archive` for completed projects kept for reference |
| **Wide-in, strict-review, fast-out** | Accept broadly, review periodically, remove decisively |

### Default Category Map (AI Reference Template)

| Prefix | Name | Purpose |
|--------|------|---------|
| `00` | `00_📥_Inbox` | Buffer zone. AI routes uncertain items here. Always first. |
| `01` | `01_🔥_Critical` | Daily productivity core: dashboards, email, work docs |
| `02` | `02_🛠️_Tools` | Utility tools: formatters, parsers, AI chat windows |
| `10` | `10_📚_Library` | Long-term knowledge base. Sub-dirs: `10.1_AI`, `10.2_Frontend`, etc. |
| `20` | `20_📂_Projects` | Active project-specific resources |
| `99` | `99_💤_Archive` | Cold storage for completed projects |

> This is a **starting template**, not a fixed schema. The AI operates in **planner mode** — it can create, rename, or restructure categories based on the user's actual bookmark content, as long as it follows the best practices above.

---

## 6. Chrome Permissions

| Permission | Purpose |
|------------|---------|
| `bookmarks` | Read and write bookmarks |
| `storage` | Local data persistence |
| `notifications` | Archive completion notifications |
| `activeTab` + `scripting` | Content Script injection for page content extraction |
| `contextMenus` | Right-click "AI Re-archive" menu |
| `<all_urls>` (host) | Allow Content Script on any page |

---

## 7. MVP Scope — Feature Checklist

| # | Feature | Priority |
|---|---------|----------|
| 1 | Project scaffolding (Vite + React + shadcn + i18n) | P0 |
| 2 | Options Page: API config + connectivity test | P0 |
| 3 | Onboarding Page: 4-step wizard | P0 |
| 4 | Bookmark backup (HTML export) | P0 |
| 5 | AI folder structure generation + user edit/confirm | P0 |
| 6 | Bulk batch archive execution | P0 |
| 7 | Bookmark Listener + Inbox mechanism | P0 |
| 8 | Content Script page content extraction | P0 |
| 9 | Task Queue (FIFO, persisted, Service Worker resilient) | P0 |
| 10 | AI Classifier (LLM API integration) | P0 |
| 11 | Bookmark Mover (move + create folders) | P0 |
| 12 | Chrome system notifications | P0 |
| 13 | Popup: status + recent archives + quick actions | P0 |
| 14 | Context menu "AI Re-archive" | P0 |
| 15 | i18n: English (default) + Chinese | P0 |

### Recommended Implementation Order

```
Phase 1: Foundation
  → Project scaffolding (#1)
  → Options Page (#2)

Phase 2: Core Engine (Background)
  → Bookmark Listener + Inbox (#7)
  → Task Queue (#9)
  → Content Script extraction (#8)
  → AI Classifier (#10)
  → Bookmark Mover (#11)
  → Chrome notifications (#12)

Phase 3: User-Facing
  → Popup (#13)
  → Context menu (#14)

Phase 4: Onboarding
  → Onboarding wizard (#3)
  → Bookmark backup (#4)
  → AI folder structure suggestion (#5)
  → Bulk archive (#6)

Phase 5: Polish
  → i18n (#15)
```

---

## 8. MVP Exclusions

| Excluded Feature | Reason |
|-----------------|--------|
| Built-in AI service | By design — users bring their own API |
| Bookmark search/browse UI | Chrome has built-in search; not MVP-critical |
| Tag/label system | Beyond MVP scope |
| Duplicate bookmark detection | Planned for P1 |
| Multi-browser sync | Beyond MVP scope |
| Chrome Web Store polish | MVP bar is "core flows functional" |

---

## References

- [Tech Stack](tech-stack.md) — Technology choices and rationale
- [Architecture](architecture.md) — System design and data flow
- [AI Prompts](ai-prompts.md) — Prompt templates and classification strategy
- [Project Structure](project-structure.md) — File layout reference
