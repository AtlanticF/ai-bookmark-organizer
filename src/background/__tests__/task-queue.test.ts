import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enqueueTask,
  dequeueTask,
  getAllTasks,
  updateTask,
  removeTask,
  clearQueue,
  getQueueLength,
} from "../task-queue";
import type { QueueTask } from "@/shared/types";

let store: Record<string, unknown> = {};

beforeEach(() => {
  store = {};
  vi.clearAllMocks();

  vi.mocked(chrome.storage.local.get).mockImplementation(
    async (keys?: string | string[] | null) => {
      if (typeof keys === "string") return { [keys]: store[keys] };
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        keys.forEach((k) => {
          result[k] = store[k];
        });
        return result;
      }
      return store;
    },
  );

  vi.mocked(chrome.storage.local.set).mockImplementation(
    async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    },
  );
});

function createTask(overrides: Partial<QueueTask> = {}): QueueTask {
  return {
    id: "task-1",
    bookmarkId: "b1",
    title: "Test",
    url: "https://test.com",
    status: "pending",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("Task Queue", () => {
  it("enqueue adds a task to storage", async () => {
    const task = createTask();
    await enqueueTask(task);

    const all = await getAllTasks();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(task);
  });

  it("dequeue returns first pending task (FIFO)", async () => {
    await enqueueTask(createTask({ id: "t1", bookmarkId: "b1" }));
    await enqueueTask(createTask({ id: "t2", bookmarkId: "b2" }));

    const task = await dequeueTask();
    expect(task?.id).toBe("t1");
  });

  it("dequeue skips non-pending tasks", async () => {
    await enqueueTask(createTask({ id: "t1", status: "classifying" }));
    await enqueueTask(createTask({ id: "t2", status: "pending" }));

    const task = await dequeueTask();
    expect(task?.id).toBe("t2");
  });

  it("dequeue returns undefined on empty queue", async () => {
    const task = await dequeueTask();
    expect(task).toBeUndefined();
  });

  it("updateTask modifies task status", async () => {
    await enqueueTask(createTask({ id: "t1" }));
    await updateTask("t1", { status: "classifying" });

    const all = await getAllTasks();
    expect(all[0]?.status).toBe("classifying");
  });

  it("updateTask ignores non-existent id", async () => {
    await enqueueTask(createTask({ id: "t1" }));
    await updateTask("non-existent", { status: "error" });

    const all = await getAllTasks();
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe("pending");
  });

  it("removeTask deletes a task", async () => {
    await enqueueTask(createTask({ id: "t1" }));
    await enqueueTask(createTask({ id: "t2" }));
    await removeTask("t1");

    const all = await getAllTasks();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe("t2");
  });

  it("clearQueue removes all tasks", async () => {
    await enqueueTask(createTask({ id: "t1" }));
    await enqueueTask(createTask({ id: "t2" }));
    await clearQueue();

    const all = await getAllTasks();
    expect(all).toHaveLength(0);
  });

  it("getQueueLength counts only pending tasks", async () => {
    await enqueueTask(createTask({ id: "t1", status: "pending" }));
    await enqueueTask(createTask({ id: "t2", status: "classifying" }));
    await enqueueTask(createTask({ id: "t3", status: "pending" }));

    const len = await getQueueLength();
    expect(len).toBe(2);
  });
});
