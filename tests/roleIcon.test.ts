import { describe, it, expect } from "vitest";
import { getRoleIcon } from "~/lib/utils/roleIcon";

describe("getRoleIcon", () => {
  it("should return icon for Архитектор", () => {
    expect(getRoleIcon("Архитектор")).toBe("🏗️");
  });

  it("should return icon for Кодер", () => {
    expect(getRoleIcon("Кодер")).toBe("💻");
  });

  it("should return icon for Дизайнер", () => {
    expect(getRoleIcon("Дизайнер")).toBe("🎨");
  });

  it("should return first letter uppercase for unknown role", () => {
    expect(getRoleIcon("CustomRole")).toBe("C");
  });

  it("should return first letter for empty-ish unknown role", () => {
    expect(getRoleIcon("x")).toBe("X");
  });

  it("should return first letter for single char", () => {
    expect(getRoleIcon("a")).toBe("A");
  });

  it("should handle all known roles", () => {
    const known: Record<string, string> = {
      "Архитектор": "🏗️",
      "Копирайтер": "✍️",
      "Кодер": "💻",
      "Тестировщик": "🧪",
      "Дизайнер": "🎨",
      "Аналитик": "📊",
      "DevOps": "🔧",
      "Менеджер": "📋",
    };
    for (const [role, icon] of Object.entries(known)) {
      expect(getRoleIcon(role)).toBe(icon);
    }
  });
});
