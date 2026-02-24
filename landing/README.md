# AI Bookmark Organizer — Landing Page

Promotional landing page for the AI Bookmark Organizer Chrome extension. Bilingual (English / 中文), modern layout, deployable to Vercel.

## Local development

```bash
cd landing
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
cd landing
pnpm build
```

Output is in `landing/dist/`.

## Screenshots

Place extension screenshots in `landing/public/screenshots/` with these names:

| File | Suggested content |
|------|-------------------|
| `popup.png` | Extension popup (status, recent archives) |
| `onboarding-step.png` | Onboarding wizard step (e.g. folder structure) |
| `options.png` | Options page (API config) |

**Recommended size:** 1200×800 px or 16:10 aspect ratio. If files are missing, the page shows a “Screenshot” placeholder.

## Deploy to Vercel

1. **Option A — Root directory = `landing`**  
   - In Vercel project settings: **Root Directory** = `landing`.  
   - **Build Command:** `pnpm build` (or `npm run build`).  
   - **Output Directory:** `dist`.

2. **Option B — Repo root**  
   - **Build Command:** `pnpm run build:landing` (from repo root; requires root `package.json` script).  
   - **Output Directory:** `landing/dist`.

After publishing the extension to Chrome Web Store, update the store URL in:

- `landing/src/components/Hero.tsx` (`CHROME_STORE_URL`)
- `landing/src/components/Footer.tsx` (`CHROME_STORE_URL`)
