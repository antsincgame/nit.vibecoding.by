import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetState = vi.hoisted(() => vi.fn(() => ({ language: "en" as const })));

vi.mock("~/lib/stores/settingsStore", () => ({
  useSettingsStore: {
    getState: mockGetState,
  },
}));

import { t } from "~/lib/utils/i18n";

describe("i18n", () => {
  beforeEach(() => {
    mockGetState.mockReturnValue({ language: "en" });
  });

  describe("t", () => {
    it("should return English translation when language is en", () => {
      mockGetState.mockReturnValue({ language: "en" });
      expect(t("chat.welcome.title")).toBe("NIT.BY");
      expect(t("chat.placeholder")).toContain("Describe what to build");
    });

    it("should return Russian translation when language is ru", () => {
      mockGetState.mockReturnValue({ language: "ru" });
      expect(t("chat.welcome.title")).toBe("NIT.BY");
      expect(t("chat.placeholder")).toContain("Опишите");
    });

    it("should return key when translation missing", () => {
      expect(t("unknown.key.xyz")).toBe("unknown.key.xyz");
    });

    it("should fallback to en when lang not in entry", () => {
      mockGetState.mockReturnValue({ language: "fr" });
      const result = t("chat.welcome.title");
      expect(result).toBe("NIT.BY");
    });
  });
});
