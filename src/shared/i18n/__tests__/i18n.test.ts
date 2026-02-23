import { describe, it, expect } from "vitest";
import i18n from "../index";

describe("i18n", () => {
  it("initializes with English as default", () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.language).toMatch(/^en/);
  });

  it("translates common keys in English", () => {
    const t = i18n.getFixedT("en");
    expect(t("common.save")).toBe("Save");
    expect(t("common.cancel")).toBe("Cancel");
    expect(t("common.next")).toBe("Next");
  });

  it("translates common keys in Chinese", () => {
    const t = i18n.getFixedT("zh-CN");
    expect(t("common.save")).toBe("保存");
    expect(t("common.cancel")).toBe("取消");
    expect(t("common.next")).toBe("下一步");
  });

  it("supports interpolation", () => {
    const t = i18n.getFixedT("en");
    expect(t("popup.status.processing", { current: 2, total: 5 })).toBe(
      "Processing 2/5",
    );
  });

  it("falls back to English for unknown locale", () => {
    const t = i18n.getFixedT("fr");
    expect(t("common.save")).toBe("Save");
  });

  it("has all namespace keys for popup", () => {
    const t = i18n.getFixedT("en");
    expect(t("popup.recentArchives")).toBe("Recent Archives");
    expect(t("popup.noRecentArchives")).toBe("No recent archives");
  });

  it("has all namespace keys for options", () => {
    const t = i18n.getFixedT("en");
    expect(t("options.title")).toBe("Settings");
    expect(t("options.testConnection")).toBe("Test Connection");
  });

  it("has all namespace keys for onboarding", () => {
    const t = i18n.getFixedT("en");
    expect(t("onboarding.title")).toBe("Welcome to AI Bookmark Organizer");
    expect(t("onboarding.step3.modeA.title")).toBe("Keep Existing Structure");
  });
});
