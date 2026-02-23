import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

function createEvent() {
  const listeners: Function[] = [];
  return {
    addListener: vi.fn((cb: Function) => listeners.push(cb)),
    removeListener: vi.fn((cb: Function) => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    hasListener: vi.fn((cb: Function) => listeners.includes(cb)),
    callListeners: (...args: unknown[]) =>
      listeners.forEach((cb) => cb(...args)),
    clearListeners: () => (listeners.length = 0),
  };
}

const chromeMock = {
  runtime: {
    id: "test-extension-id",
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
    onInstalled: createEvent(),
    onMessage: createEvent(),
    sendMessage: vi.fn(),
    openOptionsPage: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn<(keys?: string | string[] | null) => Promise<Record<string, unknown>>>().mockResolvedValue({}),
      set: vi.fn<(items: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined),
      remove: vi.fn<(keys: string | string[]) => Promise<void>>().mockResolvedValue(undefined),
      clear: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      onChanged: createEvent(),
    },
    onChanged: createEvent(),
  },
  bookmarks: {
    getTree: vi.fn<() => Promise<chrome.bookmarks.BookmarkTreeNode[]>>().mockResolvedValue([]),
    get: vi.fn<(id: string) => Promise<chrome.bookmarks.BookmarkTreeNode[]>>().mockResolvedValue([]),
    create: vi.fn<(bookmark: chrome.bookmarks.BookmarkCreateArg) => Promise<chrome.bookmarks.BookmarkTreeNode>>().mockResolvedValue({ id: "new-id", title: "" } as chrome.bookmarks.BookmarkTreeNode),
    move: vi.fn<(id: string, destination: chrome.bookmarks.BookmarkDestinationArg) => Promise<chrome.bookmarks.BookmarkTreeNode>>().mockResolvedValue({} as chrome.bookmarks.BookmarkTreeNode),
    remove: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    search: vi.fn<(query: string) => Promise<chrome.bookmarks.BookmarkTreeNode[]>>().mockResolvedValue([]),
    onCreated: createEvent(),
    onRemoved: createEvent(),
    onChanged: createEvent(),
    onMoved: createEvent(),
  },
  tabs: {
    create: vi.fn().mockResolvedValue({ id: 1 }),
    query: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({}),
  },
  notifications: {
    create: vi.fn(),
    clear: vi.fn(),
    onClicked: createEvent(),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
    onAlarm: createEvent(),
  },
  contextMenus: {
    create: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
    onClicked: createEvent(),
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue([]),
  },
};

Object.assign(globalThis, { chrome: chromeMock });
