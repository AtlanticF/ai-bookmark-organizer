import { storageGet, storageSet } from "@/shared/lib/storage";
import type { QueueTask } from "@/shared/types";

export async function enqueueTask(task: QueueTask): Promise<void> {
  const queue = (await storageGet("task_queue")) ?? [];
  queue.push(task);
  await storageSet("task_queue", queue);
}

export async function dequeueTask(): Promise<QueueTask | undefined> {
  const queue = (await storageGet("task_queue")) ?? [];
  const task = queue.find((t) => t.status === "pending");
  return task;
}

export async function peekTask(): Promise<QueueTask | undefined> {
  return dequeueTask();
}

export async function getAllTasks(): Promise<QueueTask[]> {
  return (await storageGet("task_queue")) ?? [];
}

export async function updateTask(
  id: string,
  partial: Partial<QueueTask>,
): Promise<void> {
  const queue = (await storageGet("task_queue")) ?? [];
  const index = queue.findIndex((t) => t.id === id);
  if (index === -1) return;
  queue[index] = { ...queue[index]!, ...partial };
  await storageSet("task_queue", queue);
}

export async function removeTask(id: string): Promise<void> {
  const queue = (await storageGet("task_queue")) ?? [];
  const filtered = queue.filter((t) => t.id !== id);
  await storageSet("task_queue", filtered);
}

export async function clearQueue(): Promise<void> {
  await storageSet("task_queue", []);
}

export async function getQueueLength(): Promise<number> {
  const queue = (await storageGet("task_queue")) ?? [];
  return queue.filter((t) => t.status === "pending").length;
}
