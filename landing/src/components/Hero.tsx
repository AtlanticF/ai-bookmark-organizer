import { useI18n } from "../i18n";

// Replace with your Chrome Web Store listing URL once published
const CHROME_STORE_URL = "https://chromewebstore.google.com/";

export function Hero() {
  const { t } = useI18n();

  return (
    <section className="relative px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
          {t.hero.title}
        </h1>
        <p className="mt-4 text-lg text-neutral-600 sm:text-xl">
          {t.hero.tagline}
        </p>
        <p className="mt-2 text-base text-neutral-500">
          {t.hero.subtitle}
        </p>
        <div className="mt-10">
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-6 py-3 text-base font-medium text-white transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2"
          >
            {t.hero.cta}
          </a>
        </div>
      </div>
    </section>
  );
}
