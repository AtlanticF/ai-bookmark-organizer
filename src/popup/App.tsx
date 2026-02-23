import { useTranslation } from "react-i18next";

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">AI Bookmark Organizer</h1>
      <p className="text-sm text-muted-foreground mt-2">
        {t("popup.status.idle")}
      </p>
    </div>
  );
}
