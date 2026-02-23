import { useTranslation } from "react-i18next";
import { ApiConfigForm } from "@/shared/components/ApiConfigForm";
import type { ApiConfig } from "@/shared/types";

interface Props {
  initialConfig: ApiConfig;
  onSave: (config: ApiConfig) => Promise<void>;
}

export default function StepApiConfig({ initialConfig, onSave }: Props) {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">
        {t("onboarding.step1.title")}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("onboarding.step1.description")}
      </p>
      <ApiConfigForm
        initialConfig={initialConfig}
        onSave={onSave}
        submitLabel={t("common.next")}
      />
    </div>
  );
}
