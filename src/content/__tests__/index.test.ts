import { describe, it, expect, vi, beforeEach } from "vitest";

type MessageCallback = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void;

let messageHandler: MessageCallback;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: MessageCallback) => {
      messageHandler = cb;
    },
  );

  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.title = "";
});

async function loadContentScript() {
  await import("../index");
}

function setMeta(name: string, content: string, attr = "name") {
  const meta = document.createElement("meta");
  meta.setAttribute(attr, name);
  meta.content = content;
  document.head.appendChild(meta);
}

describe("Content Script", () => {
  it("registers message listener on load", async () => {
    await loadContentScript();
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
  });

  it("extracts title, meta description, and body summary", async () => {
    document.title = "Test Page Title";
    setMeta("description", "A test page description");
    document.body.innerText = "This is the body content of the page.";

    await loadContentScript();
    const sendResponse = vi.fn();
    messageHandler({ type: "EXTRACT_CONTENT" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({
      title: "Test Page Title",
      description: "A test page description",
      summary: "This is the body content of the page.",
    });
  });

  it("falls back to og:description when meta description is missing", async () => {
    document.title = "OG Page";
    setMeta("og:description", "OpenGraph description", "property");
    document.body.innerText = "Body text";

    await loadContentScript();
    const sendResponse = vi.fn();
    messageHandler({ type: "EXTRACT_CONTENT" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "OpenGraph description",
      }),
    );
  });

  it("includes keywords in description when present", async () => {
    document.title = "Keywords Page";
    setMeta("description", "Page desc");
    setMeta("keywords", "react, typescript, chrome");
    document.body.innerText = "Content";

    await loadContentScript();
    const sendResponse = vi.fn();
    messageHandler({ type: "EXTRACT_CONTENT" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Page desc | react, typescript, chrome",
      }),
    );
  });

  it("returns empty strings when no meta tags exist", async () => {
    document.title = "Bare Page";
    document.body.innerText = "Just body";

    await loadContentScript();
    const sendResponse = vi.fn();
    messageHandler({ type: "EXTRACT_CONTENT" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({
      title: "Bare Page",
      description: "",
      summary: "Just body",
    });
  });

  it("truncates body text to 500 characters", async () => {
    document.title = "Long Page";
    document.body.innerText = "x".repeat(800);

    await loadContentScript();
    const sendResponse = vi.fn();
    messageHandler({ type: "EXTRACT_CONTENT" }, {}, sendResponse);

    const result = sendResponse.mock.calls[0]?.[0] as { summary: string };
    expect(result.summary.length).toBe(500);
  });

  it("strips excess whitespace from body text", async () => {
    document.title = "Whitespace Page";
    document.body.innerText = "hello   \n\n  world   \t  foo";

    await loadContentScript();
    const sendResponse = vi.fn();
    messageHandler({ type: "EXTRACT_CONTENT" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "hello world foo",
      }),
    );
  });

  it("does not respond to unknown message types", async () => {
    await loadContentScript();
    const sendResponse = vi.fn();
    const result = messageHandler({ type: "UNKNOWN_TYPE" }, {}, sendResponse);

    expect(sendResponse).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("returns false from listener (synchronous response)", async () => {
    document.title = "Sync";
    document.body.innerText = "text";

    await loadContentScript();
    const sendResponse = vi.fn();
    const result = messageHandler({ type: "EXTRACT_CONTENT" }, {}, sendResponse);

    expect(result).toBe(false);
  });
});
