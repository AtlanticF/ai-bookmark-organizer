import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { storageGet, onStorageChanged } from "@/shared/lib/storage";
import type { QueueTask } from "@/shared/types";

type FilterTab = "all" | "inProgress" | "done" | "error";

const STATUS_LABELS: Record<QueueTask["status"], string> = {
  pending: "Pending",
  extracting: "Extracting",
  classifying: "Classifying",
  moving: "Moving",
  done: "Done",
  error: "Error",
};

const STATUS_COLORS: Record<QueueTask["status"], string> = {
  pending: "bg-gray-200 text-gray-700",
  extracting: "bg-blue-100 text-blue-700",
  classifying: "bg-purple-100 text-purple-700",
  moving: "bg-yellow-100 text-yellow-700",
  done: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

export default function App() {
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

  const stats = {
    pending: tasks.filter((t) => t.status === "pending").length,
    processing: tasks.filter(
      (t) =>
        t.status === "extracting" ||
        t.status === "classifying" ||
        t.status === "moving",
    ).length,
    completed: tasks.filter((t) => t.status === "done").length,
    failed: tasks.filter((t) => t.status === "error").length,
  };

  const filtered = tasks.filter((task) => {
    if (filter === "all") return true;
    if (filter === "inProgress")
      return (
        task.status === "pending" ||
        task.status === "extracting" ||
        task.status === "classifying" ||
        task.status === "moving"
      );
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
    return (
      <div className="max-w-3xl mx-auto p-8">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: t("tasks.filter.all") },
    { key: "inProgress", label: t("tasks.filter.inProgress") },
    { key: "done", label: t("tasks.filter.done") },
    { key: "error", label: t("tasks.filter.error") },
  ];

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">{t("tasks.title")}</h1>

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
                <p className="text-sm font-medium truncate" title={task.title}>
                  {task.title}
                </p>
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
