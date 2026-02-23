import { useEffect, useState } from "react";
import { storageGet, onStorageChanged } from "@/shared/lib/storage";
import type { QueueTask } from "@/shared/types";

export interface QueueStatus {
  total: number;
  pending: number;
  inProgress: number;
}

export function useQueueStatus(): QueueStatus {
  const [status, setStatus] = useState<QueueStatus>({
    total: 0,
    pending: 0,
    inProgress: 0,
  });

  useEffect(() => {
    let cancelled = false;

    storageGet("task_queue").then((queue) => {
      if (cancelled) return;
      if (queue) setStatus(computeStatus(queue));
    });

    const unsub = onStorageChanged("task_queue", (newValue) => {
      if (cancelled) return;
      setStatus(computeStatus(newValue ?? []));
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return status;
}

function computeStatus(queue: QueueTask[]): QueueStatus {
  return {
    total: queue.length,
    pending: queue.filter((t) => t.status === "pending").length,
    inProgress: queue.filter(
      (t) =>
        t.status === "extracting" ||
        t.status === "classifying" ||
        t.status === "moving",
    ).length,
  };
}
