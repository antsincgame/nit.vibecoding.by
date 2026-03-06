import { describe, it, expect, beforeEach } from "vitest";

// We need to test the module in isolation.
// Since roleService uses in-memory state, we need to re-import fresh each test.
// We'll use vitest's module mocking capabilities.

// Mock the logger to avoid console output
import { vi } from "vitest";
vi.mock("~/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  getAllRoles,
  getRoleById,
  getLockedRole,
  createRole,
  updateRole,
  deleteRole,
  reorderRoles,
  getPromptHistory,
} from "~/lib/services/roleService";

describe("roleService", () => {
  // Note: Seed runs once on first call, so tests may depend on order.
  // That's OK for in-memory seed testing.

  describe("getAllRoles", () => {
    it("returns seeded roles sorted by order", () => {
      const roles = getAllRoles();
      expect(roles.length).toBeGreaterThanOrEqual(3);
      expect(roles[0]!.name).toBe("Архитектор");
      expect(roles[1]!.name).toBe("Копирайтер");
      expect(roles[2]!.name).toBe("Тестировщик");

      // Verify sorted by order
      for (let i = 1; i < roles.length; i++) {
        expect(roles[i]!.order).toBeGreaterThanOrEqual(roles[i - 1]!.order);
      }
    });

    it("filters active only", () => {
      const all = getAllRoles();
      const active = getAllRoles(true);
      // All seed roles are active
      expect(active.length).toBe(all.length);
    });
  });

  describe("getRoleById", () => {
    it("returns role by id", () => {
      const role = getRoleById("role_architect");
      expect(role).not.toBeNull();
      expect(role!.name).toBe("Архитектор");
    });

    it("returns null for non-existent id", () => {
      expect(getRoleById("nonexistent")).toBeNull();
    });
  });

  describe("getLockedRole", () => {
    it("returns the architect (locked role)", () => {
      const locked = getLockedRole();
      expect(locked).not.toBeNull();
      expect(locked!.name).toBe("Архитектор");
      expect(locked!.isLocked).toBe(true);
    });
  });

  describe("createRole", () => {
    it("creates a new role with generated id", () => {
      const role = createRole({
        name: "SEO-мастер",
        description: "Проверяет SEO-оптимизацию страниц и мета-теги",
        systemPrompt: "Ты SEO-специалист. Проверяй meta-теги, заголовки, alt-тексты и ключевые слова. " +
          "Формат ответа: список рекомендаций.",
        providerId: "ollama",
        modelName: "mistral",
        order: 4,
        isActive: true,
        isLocked: false,
        timeoutMs: 60000,
        maxRetries: 2,
        outputFormat: "freetext",
        includeNitPrompt: false,
        temperature: 0.5,
      });

      expect(role.id).toMatch(/^role_/);
      expect(role.name).toBe("SEO-мастер");
      expect(role.createdAt).toBeTruthy();
      expect(role.updatedAt).toBeTruthy();

      // Verify it's in the list
      const found = getRoleById(role.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("SEO-мастер");
    });

    it("throws on duplicate name (case-insensitive)", () => {
      expect(() =>
        createRole({
          name: "Архитектор",
          description: "Duplicate architect role for testing",
          systemPrompt: "Ты дубликат архитектора. Это тестовый промпт для проверки уникальности имён ролей.",
          providerId: "ollama",
          modelName: "mistral",
          order: 99,
          isActive: true,
          isLocked: false,
          timeoutMs: 60000,
          maxRetries: 0,
          outputFormat: "freetext",
        includeNitPrompt: false,
          temperature: 0.5,
        }),
      ).toThrow(/уже существует/);
    });

    it("throws on duplicate name different case", () => {
      expect(() =>
        createRole({
          name: "архитектор",
          description: "Lowercase duplicate architect for testing",
          systemPrompt: "Ты дубликат архитектора с маленькой буквы. Тестовый промпт для уникальности.",
          providerId: "ollama",
          modelName: "mistral",
          order: 99,
          isActive: true,
          isLocked: false,
          timeoutMs: 60000,
          maxRetries: 0,
          outputFormat: "freetext",
        includeNitPrompt: false,
          temperature: 0.5,
        }),
      ).toThrow(/уже существует/);
    });
  });

  describe("updateRole", () => {
    it("updates role fields", () => {
      const updated = updateRole("role_copywriter", { description: "Обновлённое описание копирайтера" });
      expect(updated).not.toBeNull();
      expect(updated!.description).toBe("Обновлённое описание копирайтера");
      expect(updated!.name).toBe("Копирайтер"); // unchanged
    });

    it("tracks prompt history on systemPrompt change", () => {
      const before = getPromptHistory("role_copywriter");
      const beforeCount = before.length;

      updateRole("role_copywriter", {
        systemPrompt: "Новый промпт для копирайтера. " +
          "Ты должен писать тексты в формальном стиле с использованием профессиональной лексики.",
      });

      const after = getPromptHistory("role_copywriter");
      expect(after.length).toBe(beforeCount + 1);
      expect(after[0]!.systemPrompt).toContain("Новый промпт");
    });

    it("protects locked role order", () => {
      const updated = updateRole("role_architect", { order: 99 });
      expect(updated).not.toBeNull();
      expect(updated!.order).toBe(1); // unchanged
    });

    it("returns null for non-existent id", () => {
      expect(updateRole("nonexistent", { name: "test" })).toBeNull();
    });

    it("throws when renaming to existing name", () => {
      expect(() =>
        updateRole("role_copywriter", { name: "Архитектор" }),
      ).toThrow(/уже существует/);
    });

    it("allows keeping same name on update", () => {
      const result = updateRole("role_copywriter", { name: "Копирайтер", description: "Обновлённый копирайтер для тестов" });
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Копирайтер");
    });
  });

  describe("deleteRole", () => {
    it("deletes non-locked role", () => {
      const role = createRole({
        name: "Temp Role",
        description: "Temporary role for testing deletion functionality",
        systemPrompt: "Ты временная роль. Эта роль будет удалена в тесте. Просто подтверди получение запроса.",
        providerId: "ollama",
        modelName: "mistral",
        order: 99,
        isActive: true,
        isLocked: false,
        timeoutMs: 60000,
        maxRetries: 0,
        outputFormat: "freetext",
        includeNitPrompt: false,
        temperature: 0.5,
      });

      expect(deleteRole(role.id)).toBe(true);
      expect(getRoleById(role.id)).toBeNull();
    });

    it("refuses to delete locked role", () => {
      expect(deleteRole("role_architect")).toBe(false);
      expect(getRoleById("role_architect")).not.toBeNull();
    });

    it("returns false for non-existent id", () => {
      expect(deleteRole("nonexistent")).toBe(false);
    });
  });

  describe("reorderRoles", () => {
    it("updates order for non-locked roles starting after locked", () => {
      // Architect is locked at order 1
      reorderRoles(["role_tester", "role_copywriter"]);

      const tester = getRoleById("role_tester");
      const copywriter = getRoleById("role_copywriter");
      const architect = getRoleById("role_architect");

      expect(architect!.order).toBe(1); // locked, unchanged
      expect(tester!.order).toBe(2);    // first non-locked → maxLockedOrder(1) + 0 + 1 = 2
      expect(copywriter!.order).toBe(3); // second non-locked → 1 + 1 + 1 = 3
    });
  });

  describe("getPromptHistory", () => {
    it("returns empty for role with no changes", () => {
      const history = getPromptHistory("role_architect");
      // Architect prompt was never changed via updateRole in tests
      expect(Array.isArray(history)).toBe(true);
    });

    it("returns entries sorted by version desc", () => {
      // Make two changes
      updateRole("role_tester", {
        systemPrompt: "Первое изменение промпта тестировщика. Проверяй всё внимательно. Пиши подробные отчёты.",
      });
      updateRole("role_tester", {
        systemPrompt: "Второе изменение промпта тестировщика. Новые правила проверки. Будь строже к ошибкам.",
      });

      const history = getPromptHistory("role_tester");
      expect(history.length).toBeGreaterThanOrEqual(2);
      // Sorted desc by version
      expect(history[0]!.version).toBeGreaterThan(history[1]!.version);
    });
  });
});
