import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useApiConfig } from "@/shared/hooks";
import { ApiConfigForm } from "@/shared/components/ApiConfigForm";
import type { ApiConfig, QueueTask } from "@/shared/types";
import { testConnection } from "@/shared/lib/api-client";
import { storageGet, storageSet, onStorageChanged } from "@/shared/lib/storage";
import i18n from "@/shared/i18n";

type NavTab = "llm" | "system" | "tasks";

const VALID_TABS: NavTab[] = ["llm", "system", "tasks"];

function getInitialTab(): NavTab {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") as NavTab | null;
  return tab && VALID_TABS.includes(tab) ? tab : "llm";
}

export default function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<NavTab>(getInitialTab);

  const navItems: { key: NavTab; label: string }[] = [
    { key: "llm", label: t("options.nav.llm") },
    { key: "system", label: t("options.nav.system") },
    { key: "tasks", label: t("options.nav.tasks") },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-52 shrink-0 border-r border-border bg-muted/30 p-4">
        <h1 className="text-base font-bold mb-6 px-2">
          AI Bookmark Organizer
        </h1>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === item.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-8 max-w-2xl">
        {activeTab === "llm" && <LlmConfigPanel />}
        {activeTab === "system" && <SystemConfigPanel />}
        {activeTab === "tasks" && <TaskQueuePanel />}
      </main>
    </div>
  );
}

function LlmConfigPanel() {
  const { t } = useTranslation();
  const { config, saveConfig, loading } = useApiConfig();
  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave(newConfig: ApiConfig) {
    await saveConfig(newConfig);
    showToast("success", t("options.saved"));
  }

  async function handleTestConnection(formConfig: ApiConfig) {
    setTesting(true);
    try {
      const success = await testConnection(formConfig);
      if (success) {
        showToast("success", t("options.testSuccess"));
      } else {
        showToast(
          "error",
          t("options.testFailed", { error: "Connection refused" }),
        );
      }
    } catch (err) {
      showToast(
        "error",
        t("options.testFailed", {
          error: err instanceof Error ? err.message : "Unknown error",
        }),
      );
    } finally {
      setTesting(false);
    }
  }

  function handleRerunArchive() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/onboarding/index.html"),
    });
  }

  if (loading) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">{t("options.nav.llm")}</h2>

      {toast && (
        <div
          role="alert"
          className={`mb-4 px-4 py-3 rounded-md text-sm ${
            toast.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <ApiConfigForm
        initialConfig={config}
        onSave={handleSave}
        showTestButton
        onTest={handleTestConnection}
        testing={testing}
      />

      <hr className="my-8 border-border" />

      <button
        type="button"
        onClick={handleRerunArchive}
        className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
      >
        {t("options.rerunArchive")}
      </button>
    </div>
  );
}

function SystemConfigPanel() {
  const { t } = useTranslation();
  const [showFab, setShowFab] = useState(true);
  const [language, setLanguage] = useState(i18n.language);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      storageGet("show_floating_button"),
      storageGet("language"),
    ]).then(([fabVal, langVal]) => {
      if (cancelled) return;
      setShowFab(fabVal !== false);
      if (langVal) setLanguage(langVal);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFabToggle(checked: boolean) {
    setShowFab(checked);
    await storageSet("show_floating_button", checked);
  }

  async function handleLanguageChange(lang: string) {
    setLanguage(lang);
    await storageSet("language", lang);
    i18n.changeLanguage(lang);
  }

  if (loading) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">{t("options.nav.system")}</h2>

      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-md border border-border p-4">
          <div>
            <p className="text-sm font-medium">{t("options.system.fabLabel")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("options.system.fabDescription")}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showFab}
            onClick={() => handleFabToggle(!showFab)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              showFab ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                showFab ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="rounded-md border border-border p-4">
          <p className="text-sm font-medium mb-3">
            {t("options.system.languageLabel")}
          </p>
          <div className="flex gap-2">
            {[
              { code: "en", label: "English" },
              { code: "zh-CN", label: "简体中文" },
            ].map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleLanguageChange(lang.code)}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  language === lang.code
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-secondary-foreground border-border hover:border-primary/50"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<QueueTask["status"], string> = {
  pending: "Pending",
  extracting: "Extracting",
  classifying: "Classifying",
  moving: "Moving",
  renaming: "Renaming",
  done: "Done",
  error: "Error",
};

const STATUS_COLORS: Record<QueueTask["status"], string> = {
  pending: "bg-gray-200 text-gray-700",
  extracting: "bg-blue-100 text-blue-700",
  classifying: "bg-purple-100 text-purple-700",
  moving: "bg-yellow-100 text-yellow-700",
  renaming: "bg-indigo-100 text-indigo-700",
  done: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

type FilterTab = "all" | "inProgress" | "done" | "error";

function TaskQueuePanel() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  useEffect(() => {
    let cancelled = false;

    storageGet("task_queue").then((queue) => {
      if (cancelled) return;
      setTasks(queue ?? []);
      setLoading(false);
    });

    const unsub = onStorageChanged("task_queue", (newVal) => {
      if (!cancelled) setTasks(newVal ?? []);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const isActive = (s: QueueTask["status"]) =>
    s === "pending" ||
    s === "extracting" ||
    s === "classifying" ||
    s === "moving" ||
    s === "renaming";

  const stats = {
    pending: tasks.filter((t) => t.status === "pending").length,
    processing: tasks.filter((t) => isActive(t.status) && t.status !== "pending").length,
    completed: tasks.filter((t) => t.status === "done").length,
    failed: tasks.filter((t) => t.status === "error").length,
  };

  const filtered = tasks.filter((task) => {
    if (filter === "all") return true;
    if (filter === "inProgress") return isActive(task.status);
    if (filter === "done") return task.status === "done";
    if (filter === "error") return task.status === "error";
    return true;
  });

  async function handleRetry(task: QueueTask) {
    const queue = (await storageGet("task_queue")) ?? [];
    const idx = queue.findIndex((t) => t.id === task.id);
    if (idx === -1) return;
    queue[idx] = { ...queue[idx]!, status: "pending", error: undefined };
    await chrome.storage.local.set({ task_queue: queue });
  }

  async function handleClearCompleted() {
    const queue = (await storageGet("task_queue")) ?? [];
    const remaining = queue.filter((t) => t.status !== "done");
    await chrome.storage.local.set({ task_queue: remaining });
  }

  if (loading) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: t("tasks.filter.all") },
    { key: "inProgress", label: t("tasks.filter.inProgress") },
    { key: "done", label: t("tasks.filter.done") },
    { key: "error", label: t("tasks.filter.error") },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">{t("tasks.title")}</h2>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard
          label={t("tasks.stats.pending")}
          value={stats.pending}
          color="text-gray-700"
        />
        <StatCard
          label={t("tasks.stats.processing")}
          value={stats.processing}
          color="text-blue-700"
        />
        <StatCard
          label={t("tasks.stats.completed")}
          value={stats.completed}
          color="text-green-700"
        />
        <StatCard
          label={t("tasks.stats.failed")}
          value={stats.failed}
          color="text-red-700"
        />
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {stats.completed > 0 && (
          <button
            type="button"
            onClick={handleClearCompleted}
            className="ml-auto px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("tasks.clearCompleted")}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t("tasks.emptyQueue")}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 p-3 border border-border rounded-md"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" title={task.renamedTitle ?? task.title}>
                  {task.renamedTitle ?? task.title}
                </p>
                {task.renamedTitle && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5" title={task.title}>
                    {t("tasks.originalTitle", { title: task.title })}
                  </p>
                )}
                <p
                  className="text-xs text-muted-foreground truncate"
                  title={task.url}
                >
                  {task.url}
                </p>
                {task.error && (
                  <p className="text-xs text-destructive mt-0.5">
                    {task.error}
                  </p>
                )}
                {task.targetFolder && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("tasks.targetFolder", { folder: task.targetFolder })}
                  </p>
                )}
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_COLORS[task.status]}`}
              >
                {STATUS_LABELS[task.status]}
              </span>
              {task.status === "error" && (
                <button
                  type="button"
                  onClick={() => handleRetry(task)}
                  className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  {t("tasks.retryTask")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-md border border-border p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
