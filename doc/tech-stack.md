# Tech Stack — AI Bookmark Organizer

## Overview

| Layer | Choice | Version |
|-------|--------|---------|
| Extension Runtime | Chrome Extension Manifest V3 | MV3 |
| Language | TypeScript | 5.x (strict mode) |
| UI Framework | React | 18.x |
| Component Library | shadcn/ui | latest |
| CSS Framework | Tailwind CSS | 4.x |
| Build Tool | Vite | 6.x |
| Extension Build Plugin | @crxjs/vite-plugin | latest |
| i18n | react-i18next + i18next | latest |
| Storage | chrome.storage.local | (Chrome API) |
| AI API Protocol | OpenAI Chat Completions API | Compatible |

---

## Selection Rationale

### Manifest V3

**Why**: Chrome has deprecated Manifest V2. All new extensions must use MV3. MV3 uses Service Workers instead of persistent background pages, which is more memory-efficient but introduces lifecycle constraints.

**Key implications**:
- Service Worker can be terminated after ~30s of inactivity
- Must persist state to `chrome.storage.local`
- Use `chrome.alarms` (min 30s interval) for periodic wake-up
- No DOM access in background — all DOM operations go through Content Scripts

### TypeScript (strict mode)

**Why**: Type safety is critical for a project with complex data flows between Service Worker, Content Script, Popup, and Options pages. Strict mode catches null/undefined errors early and enforces exhaustive type checks on LLM response parsing.

### React 18

**Why**: Mature ecosystem, excellent TypeScript support, wide community. Three separate pages (Popup, Options, Onboarding) share components through a common `src/shared/` layer. React's component model makes this clean.

**Alternatives considered**:
- **Vue 3**: Equally capable, but React's TypeScript integration is marginally better and shadcn/ui is React-native
- **Vanilla JS**: Too verbose for the Onboarding wizard and folder structure editor
- **Svelte**: Smaller bundle but less ecosystem support for the component library we need

### shadcn/ui

**Why**: Not a traditional component library — it generates components into your codebase, giving full control. Built on Radix UI (accessible primitives) + Tailwind CSS. Perfect for:
- Onboarding step wizard
- Folder tree editor (with drag-and-drop)
- Settings forms
- Toast notifications in popup

**Key advantage over alternatives**: No runtime dependency, components are yours to customize. Bundle size stays minimal.

### Tailwind CSS 4

**Why**: Required by shadcn/ui. Utility-first approach keeps styles co-located with components. JIT compilation ensures only used styles are bundled — critical for extension popup where size matters.

### Vite + @crxjs/vite-plugin

**Why**: Vite provides fast HMR during development. `@crxjs/vite-plugin` handles the Chrome extension-specific build concerns:
- Multiple HTML entry points (popup, options, onboarding)
- Service Worker bundling
- Content Script injection
- Manifest generation from TypeScript
- Hot reload during development (auto-refreshes extension)

**Alternatives considered**:
- **webpack + crx**: More mature but significantly slower build times
- **Plasmo**: Higher-level framework but too opinionated; less control over build output
- **WXT**: Good option but younger ecosystem; @crxjs is more battle-tested

### react-i18next

**Why**: De facto standard for React i18n. Features used:
- `useTranslation` hook for functional components
- Namespace support (separate translation files per page if needed)
- Interpolation for dynamic content (e.g., "Archived to {{folder}}")
- Language detection (follows browser locale)

**Supported locales**:
- `en` — English (default)
- `zh-CN` — Simplified Chinese

Translation files live in `src/shared/i18n/en.json` and `src/shared/i18n/zh-CN.json`.

### chrome.storage.local

**Why**: Built-in Chrome API, no external database needed. Sufficient for the data volume of bookmark management (metadata only, no large blobs).

**Capacity**: ~10MB by default (unlimited with `"unlimitedStorage"` permission, which we don't request in MVP).

**Alternatives considered**:
- **IndexedDB**: More powerful queries but overkill for our simple key-value needs
- **External DB / Supabase**: Violates the "no third-party dependency" principle

### OpenAI Chat Completions API (Compatible)

**Why**: The OpenAI Chat Completions API has become a de facto standard. Most LLM providers support it:
- OpenAI (GPT-4o, GPT-4o-mini)
- Anthropic (via proxy)
- Local models (Ollama, LM Studio, vLLM)
- Cloud providers (Azure OpenAI, Groq, Together AI, DeepSeek)

Users configure `baseUrl` + `apiKey` + `model` — the same API client works for all providers.

---

## Build Output

```
dist/
├── manifest.json           # Generated from src/manifest.ts
├── service-worker.js       # Background Service Worker (bundled)
├── content-script.js       # Content Script (bundled)
├── popup/
│   ├── index.html
│   └── assets/             # JS + CSS chunks
├── options/
│   ├── index.html
│   └── assets/
├── onboarding/
│   ├── index.html
│   └── assets/
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── _locales/
    ├── en/messages.json
    └── zh_CN/messages.json
```

---

## Development Workflow

```bash
# Install dependencies
pnpm install

# Development with hot reload
pnpm dev

# Build for production
pnpm build

# Load in Chrome:
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" → select dist/ folder
```

---

## References

- [MVP Spec](mvp-spec.md) — Product specification
- [Architecture](architecture.md) — System design details
- [Project Structure](project-structure.md) — File layout reference
