console.log("[AI Bookmark Organizer] Service Worker started");

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[AI Bookmark Organizer] First install — opening onboarding");
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/onboarding/index.html"),
    });
  }
});

export {};
