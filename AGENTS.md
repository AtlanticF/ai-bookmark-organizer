# AI Bookmark Organizer — Agent Rules

## Project Overview

A Chrome extension (Manifest V3) that leverages user-provided LLM services to automatically organize bookmarks into a semantically structured, flat directory system following best practices.

## Core Principles

1. **Zero migration cost** — Operates directly on Chrome native bookmarks, no third-party platform dependency
2. **AI-native semantic classification** — True content understanding, not keyword matching
3. **Privacy-first, no subscription** — Users bring their own OpenAI-compatible API; data stays local

## Tech Stack

- **Runtime**: Chrome Extension Manifest V3
- **UI Framework**: React 18 + TypeScript
- **Component Library**: shadcn/ui (Radix UI + Tailwind CSS)
- **Build Tool**: Vite with `@crxjs/vite-plugin`
- **i18n**: react-i18next (default: English, supported: zh-CN)
- **Storage**: chrome.storage.local (no external DB)

## Key Conventions

### Code Style

- TypeScript strict mode enabled
- All UI text must go through i18n (`useTranslation` hook), never hardcode display strings
- Use `chrome.storage.local` for all persistence; wrap access through `src/shared/lib/storage.ts`
- API Key stored locally with encryption via `chrome.storage.local`

### Directory Naming

- Use kebab-case for all file and directory names
- React components use PascalCase filenames (e.g., `StepApiConfig.tsx`)
- Shared utilities go in `src/shared/lib/`
- Shared React hooks go in `src/shared/hooks/`
- shadcn/ui components go in `src/shared/components/ui/`

### Chrome Extension Specifics

- Background logic runs in Service Worker (`src/background/`)
- Service Worker may be terminated after 30s of inactivity; use `chrome.alarms` for keep-alive
- Task queue must be persisted to `chrome.storage.local` to survive Service Worker restarts
- Content Script (`src/content/`) communicates with background via `chrome.runtime.sendMessage`
- All pages (popup, options, onboarding) are separate entry points with their own `index.html` + `main.tsx`
- New bookmark events use a debounce strategy: `onCreated` does NOT immediately process; waits 5s for Chrome's native dialog to settle, monitors `onMoved`/`onChanged`/`onRemoved` to detect user interaction, then processes the bookmark in its final state

### AI Integration

- All LLM calls go through `src/shared/lib/api-client.ts`
- Prompt templates live in `src/background/ai-classifier.ts`
- LLM responses must be parsed as JSON with error handling and retry logic
- Confidence threshold: if AI confidence < 0.5, route bookmark to Inbox
- Archive notifications include an "Undo" button; undo records are stored in `chrome.storage.local` with a 15s TTL

### Bookmark Organization Best Practices (built into AI prompts)

- **Flat over deep**: Max 2 levels (category → subcategory)
- **Prefix-coded sorting**: Numeric prefixes control display order (e.g., `01_🔥_Critical`)
- **Inbox philosophy**: `00_📥_Inbox` always exists as a buffer for uncertain classifications
- **Archive cold storage**: `99_💤_Archive` for completed projects
- **Wide-in, strict-review, fast-out**: Accept broadly, review periodically, remove decisively

## Documentation

All project documentation lives in `doc/`. See [doc/README.md](doc/README.md) for the full index.

- [MVP Spec](doc/mvp-spec.md) — Product specification and feature scope
- [Tech Stack](doc/tech-stack.md) — Technology selection rationale
- [Architecture](doc/architecture.md) — System architecture and module design
- [AI Prompts](doc/ai-prompts.md) — LLM prompt design and strategy
- [Project Structure](doc/project-structure.md) — File and directory layout reference
