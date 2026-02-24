import { useI18n } from "../i18n";

const STEPS = ["step1", "step2", "step3", "step4"] as const;

export function HowItWorks() {
  const { t } = useI18n();

  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-2xl font-semibold text-neutral-900 sm:text-3xl">
          {t.howItWorks.title}
        </h2>
        <ol className="mt-10 space-y-4">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="flex gap-4 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-neutral-700"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-medium text-white">
                {index + 1}
              </span>
              <span>{t.howItWorks[step]}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
