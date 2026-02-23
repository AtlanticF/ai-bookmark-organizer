import { useTranslation } from "react-i18next";

interface Props {
  onModeA: () => void;
  onModeB: () => void;
  onBack: () => void;
}

export default function StepModeSelect({ onModeA, onModeB, onBack }: Props) {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">
        {t("onboarding.step3.title")}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {t("onboarding.step3.description")}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          type="button"
          onClick={onModeA}
          className="p-5 border border-border rounded-lg text-left hover:border-primary hover:bg-accent transition-colors"
          data-testid="mode-a"
        >
          <h3 className="font-medium mb-1">
            {t("onboarding.step3.modeA.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("onboarding.step3.modeA.description")}
          </p>
        </button>

        <button
          type="button"
          onClick={onModeB}
          className="p-5 border border-border rounded-lg text-left hover:border-primary hover:bg-accent transition-colors"
          data-testid="mode-b"
        >
          <h3 className="font-medium mb-1">
            {t("onboarding.step3.modeB.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("onboarding.step3.modeB.description")}
          </p>
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
      >
        {t("common.back")}
      </button>
    </div>
  );
}
