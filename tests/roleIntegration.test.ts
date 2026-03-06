import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

/**
 * Integration test: simulates full lifecycle of roles as the UI would use them.
 */
describe("Role lifecycle integration", () => {
  it("full CRUD lifecycle", () => {
    // 1. Get initial seed roles
    const initial = getAllRoles();
    expect(initial.length).toBeGreaterThanOrEqual(3);

    const architect = getLockedRole();
    expect(architect).not.toBeNull();
    expect(architect!.name).toBe("Архитектор");

    // 2. Create a new role
    const seo = createRole({
      name: `SEO-${Date.now()}`,
      description: "Проверяет SEO-оптимизацию страниц и мета-теги",
      systemPrompt: "Ты SEO-специалист. Проверяй meta-теги, заголовки, alt-тексты. Формат: список рекомендаций.",
      providerId: "lm-studio",
      modelName: "codellama",
      order: 4,
      isActive: true,
      isLocked: false,
      timeoutMs: 90000,
      maxRetries: 1,
      outputFormat: "freetext",
        includeNitPrompt: false,
      temperature: 0.5,
    });
    expect(seo.id).toMatch(/^role_/);
    expect(seo.providerId).toBe("lm-studio");

    // 3. Update the role
    const updated = updateRole(seo.id, {
      modelName: "mistral",
      temperature: 0.8,
    });
    expect(updated!.modelName).toBe("mistral");
    expect(updated!.temperature).toBe(0.8);
    expect(updated!.name).toBe(seo.name); // unchanged

    // 4. Update system prompt — should create history
    updateRole(seo.id, {
      systemPrompt: "Обновлённый промпт для SEO-роли. Проверяй meta-теги, заголовки, описания, og-теги и ключевые слова.",
    });
    const history = getPromptHistory(seo.id);
    expect(history.length).toBe(1);
    expect(history[0]!.version).toBe(1);

    // 5. Update prompt again — version increments
    updateRole(seo.id, {
      systemPrompt: "Второй вариант SEO-промпта. Фокус на техническом SEO: скорость загрузки, мобильная адаптация.",
    });
    const history2 = getPromptHistory(seo.id);
    expect(history2.length).toBe(2);
    expect(history2[0]!.version).toBe(2); // sorted desc

    // 6. Reorder roles
    const before = getAllRoles();
    const nonLockedIds = before.filter((r) => !r.isLocked).map((r) => r.id);
    const reversed = [...nonLockedIds].reverse();
    reorderRoles(reversed);

    const after = getAllRoles();
    expect(after[0]!.name).toBe("Архитектор"); // still first (locked)
    // Non-locked roles reordered
    const nonLockedAfter = after.filter((r) => !r.isLocked);
    expect(nonLockedAfter[0]!.order).toBeGreaterThan(1);

    // 7. Try to delete locked role — should fail
    expect(deleteRole("role_architect")).toBe(false);
    expect(getRoleById("role_architect")).not.toBeNull();

    // 8. Delete SEO role — should succeed
    expect(deleteRole(seo.id)).toBe(true);
    expect(getRoleById(seo.id)).toBeNull();

    // 9. Verify original roles still intact
    expect(getRoleById("role_architect")).not.toBeNull();
    expect(getRoleById("role_copywriter")).not.toBeNull();
    expect(getRoleById("role_tester")).not.toBeNull();
  });

  it("provider ID matches LLMManager names", () => {
    // This test ensures seed roles use valid provider IDs
    const validProviderIds = ["ollama", "lm-studio", "custom"];
    const roles = getAllRoles();

    for (const role of roles) {
      expect(validProviderIds).toContain(role.providerId);
    }
  });

  it("all seed roles have valid system prompts", () => {
    const roles = getAllRoles();
    for (const role of roles) {
      expect(role.systemPrompt.length).toBeGreaterThan(50);
      expect(role.description.length).toBeGreaterThan(10);
      expect(role.name.length).toBeGreaterThan(0);
    }
  });

  it("locked role always comes first in sorted list", () => {
    const roles = getAllRoles(true);
    const lockedIdx = roles.findIndex((r) => r.isLocked);
    expect(lockedIdx).toBe(0);

    // All subsequent roles have higher order
    for (let i = 1; i < roles.length; i++) {
      expect(roles[i]!.order).toBeGreaterThanOrEqual(roles[0]!.order);
    }
  });

  it("activeOnly filter works", () => {
    // Create inactive role
    const inactive = createRole({
      name: `Inactive-${Date.now()}`,
      description: "Неактивная роль для проверки фильтрации",
      systemPrompt: "Эта роль неактивна и не должна появляться в списке активных ролей для тестирования.",
      providerId: "ollama",
      modelName: "mistral",
      order: 99,
      isActive: false,
      isLocked: false,
      timeoutMs: 60000,
      maxRetries: 0,
      outputFormat: "freetext",
        includeNitPrompt: false,
      temperature: 0.5,
    });

    const all = getAllRoles(false);
    const active = getAllRoles(true);

    expect(all.length).toBeGreaterThan(active.length);
    expect(active.find((r) => r.id === inactive.id)).toBeUndefined();
    expect(all.find((r) => r.id === inactive.id)).not.toBeUndefined();

    // Cleanup
    deleteRole(inactive.id);
  });
});
