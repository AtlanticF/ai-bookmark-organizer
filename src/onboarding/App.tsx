import { useTranslation } from "react-i18next";

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold">{t("onboarding.title")}</h1>
      <p className="text-muted-foreground mt-2">
        {t("onboarding.step1.description")}
      </p>
    </div>
  );
}
