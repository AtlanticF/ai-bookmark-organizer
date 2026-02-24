import { useI18n } from "../i18n";

// Same as Hero – update to your Chrome Web Store listing URL when published
const CHROME_STORE_URL = "https://chromewebstore.google.com/";

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-6 sm:flex-row">
        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2"
        >
          {t.footer.cta}
        </a>
        <p className="text-sm text-neutral-500">{t.footer.license}</p>
      </div>
    </footer>
  );
}
