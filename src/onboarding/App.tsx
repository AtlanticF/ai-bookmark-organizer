import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiConfig } from "@/shared/hooks";
import { storageSet } from "@/shared/lib/storage";
import type { ApiConfig, ProposedFolder } from "@/shared/types";
import StepApiConfig from "./steps/StepApiConfig";
import StepConnTest from "./steps/StepConnTest";
import StepModeSelect from "./steps/StepModeSelect";
import StepBulkArchive from "./steps/StepBulkArchive";

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS = [
  "onboarding.step1.title",
  "onboarding.step2.title",
  "onboarding.step3.title",
  "onboarding.step4.title",
] as const;

export default function App() {
  const { t } = useTranslation();
  const { config, saveConfig, loading } = useApiConfig();

  const [step, setStep] = useState<WizardStep>(1);
  const [folderStructure, setFolderStructure] = useState<ProposedFolder[]>([]);

  async function handleApiSave(newConfig: ApiConfig) {
    await saveConfig(newConfig);
    setStep(2);
  }

  function handleConnSuccess() {
    setStep(3);
  }

  async function handleModeA() {
    await storageSet("onboarding_completed", true);
    window.close();
  }

  function handleModeB() {
    setStep(4);
  }

  async function handleComplete() {
    await storageSet("onboarding_completed", true);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">{t("onboarding.title")}</h1>

      <div className="flex gap-2 mb-8" role="navigation" aria-label="Steps">
        {STEP_LABELS.map((label, i) => {
          const stepNum = (i + 1) as WizardStep;
          const isActive = step === stepNum;
          const isCompleted = step > stepNum;
          return (
            <div
              key={label}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isCompleted
                    ? "bg-green-100 text-green-800"
                    : "bg-muted text-muted-foreground"
              }`}
              data-testid={`step-indicator-${stepNum}`}
            >
              <span className="font-medium">{stepNum}</span>
              <span>{t(label)}</span>
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <StepApiConfig
          initialConfig={config}
          onSave={handleApiSave}
        />
      )}

      {step === 2 && (
        <StepConnTest
          onSuccess={handleConnSuccess}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <StepModeSelect
          onModeA={handleModeA}
          onModeB={handleModeB}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && (
        <StepBulkArchive
          folderStructure={folderStructure}
          setFolderStructure={setFolderStructure}
          onComplete={handleComplete}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  );
}
