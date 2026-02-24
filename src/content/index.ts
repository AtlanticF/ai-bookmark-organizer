import { initFloatingButton } from "./floating-button";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "EXTRACT_CONTENT") return false;

  const title = document.title;

  const metaDescription =
    document.querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.content ?? "";

  const ogDescription =
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')
      ?.content ?? "";

  const keywords =
    document.querySelector<HTMLMetaElement>('meta[name="keywords"]')
      ?.content ?? "";

  const description = [metaDescription || ogDescription, keywords]
    .filter(Boolean)
    .join(" | ");

  const bodyText = (document.body.innerText ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  sendResponse({ title, description, summary: bodyText });
  return false;
});

initFloatingButton();
