import { useI18n } from "../i18n";
import { Screenshot } from "./Screenshot";

const FEATURES = [
  {
    key: "zeroMigration" as const,
    image: "/screenshots/popup.png",
  },
  {
    key: "semantic" as const,
    image: "/screenshots/onboarding-step.png",
  },
  {
    key: "privacy" as const,
    image: "/screenshots/options.png",
  },
] as const;

export function Features() {
  const { t } = useI18n();

  return (
    <section className="border-t border-neutral-200 bg-neutral-50/50 px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-2xl font-semibold text-neutral-900 sm:text-3xl">
          {t.features.title}
        </h2>
        <ul className="mt-12 space-y-16 sm:space-y-20">
          {FEATURES.map(({ key, image }) => {
            const feature = t.features[key];
            const title = feature.title;
            const description = feature.description;
            return (
              <li key={key} className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-12">
                <div className="flex-1">
                  <h3 className="text-xl font-medium text-neutral-900">{title}</h3>
                  <p className="mt-2 text-neutral-600">{description}</p>
                </div>
                <div className="w-full flex-shrink-0 sm:w-80">
                  <Screenshot
                    src={image}
                    alt={title}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
