import { describe, it, expect } from "vitest";

describe("Test infrastructure", () => {
  it("chrome.storage.local mock exists", () => {
    expect(chrome.storage).toBeDefined();
    expect(chrome.storage.local).toBeDefined();
    expect(chrome.storage.local.get).toBeDefined();
    expect(chrome.storage.local.set).toBeDefined();
  });

  it("chrome.bookmarks mock exists", () => {
    expect(chrome.bookmarks).toBeDefined();
    expect(chrome.bookmarks.getTree).toBeDefined();
    expect(chrome.bookmarks.create).toBeDefined();
    expect(chrome.bookmarks.move).toBeDefined();
    expect(chrome.bookmarks.onCreated).toBeDefined();
  });

  it("chrome.notifications mock exists", () => {
    expect(chrome.notifications).toBeDefined();
    expect(chrome.notifications.create).toBeDefined();
  });

  it("chrome.runtime mock exists", () => {
    expect(chrome.runtime).toBeDefined();
    expect(chrome.runtime.onInstalled).toBeDefined();
    expect(chrome.runtime.onMessage).toBeDefined();
    expect(chrome.runtime.sendMessage).toBeDefined();
  });

  it("chrome.alarms mock exists", () => {
    expect(chrome.alarms).toBeDefined();
    expect(chrome.alarms.create).toBeDefined();
    expect(chrome.alarms.onAlarm).toBeDefined();
  });

  it("chrome.contextMenus mock exists", () => {
    expect(chrome.contextMenus).toBeDefined();
    expect(chrome.contextMenus.create).toBeDefined();
  });

  it("chrome.tabs mock exists", () => {
    expect(chrome.tabs).toBeDefined();
    expect(chrome.tabs.sendMessage).toBeDefined();
    expect(chrome.tabs.create).toBeDefined();
  });
});
