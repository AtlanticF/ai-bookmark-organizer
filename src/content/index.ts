chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXTRACT_CONTENT") {
    const title = document.title;

    const metaDescription =
      document.querySelector<HTMLMetaElement>('meta[name="description"]')
        ?.content ?? "";

    const ogDescription =
      document.querySelector<HTMLMetaElement>('meta[property="og:description"]')
        ?.content ?? "";

    const bodyText = (document.body.innerText ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

    sendResponse({
      title,
      description: metaDescription || ogDescription,
      summary: bodyText,
    });
  }

  return false;
});

export {};
