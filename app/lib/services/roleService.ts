/**
 * Role Service — CRUD for agent roles.
 *
 * Currently in-memory with seed data.
 * TODO: Replace with Appwrite when DB phase starts.
 */

import type { AgentRole, PromptHistoryEntry } from "@shared/types/agentRole";
import { logger } from "~/lib/utils/logger";

// ─── In-memory storage ──────────────────────────────────────

const roles = new Map<string, AgentRole>();
const promptHistory: PromptHistoryEntry[] = [];

let seeded = false;

function ensureSeed() {
  if (seeded) return;
  seeded = true;

  const now = new Date().toISOString();

  const defaults: Omit<AgentRole, "id" | "name" | "description" | "systemPrompt" | "order" | "isLocked" | "outputFormat" | "temperature" | "includeNitPrompt">
    = {
    providerId: "ollama",
    modelName: "mistral",
    isActive: true,
    timeoutMs: 60_000,
    maxRetries: 2,
    createdAt: now,
    updatedAt: now,
  };

  const seed: AgentRole[] = [
    {
      ...defaults,
      id: "role_architect",
      name: "Архитектор",
      description: "Создаёт структуру, навигацию, UX, цвета",
      order: 1,
      isLocked: true,
      outputFormat: "json",
      includeNitPrompt: false,
      temperature: 0.3,
      systemPrompt: `Ты Архитектор веб-студии. Твоя задача — создать структуру проекта.

На основе запроса пользователя ты ОБЯЗАН вернуть JSON в формате:

{
  "project_name": "string",
  "pages": [
    {
      "slug": "string",
      "title": "string",
      "purpose": "string",
      "sections": [
        {
          "id": "string",
          "type": "hero | features | cta | content | gallery | form | footer | header | testimonials | pricing | faq",
          "description": "string",
          "notes": "string"
        }
      ]
    }
  ],
  "navigation": {
    "type": "top | sidebar | burger",
    "items": [{"label": "string", "href": "string"}]
  },
  "design": {
    "style": "string",
    "primary_color": "#hex",
    "secondary_color": "#hex",
    "accent_color": "#hex",
    "font_heading": "string",
    "font_body": "string"
  },
  "tech_notes": "string"
}

Никакого свободного текста. Только JSON. Без markdown-блоков.`,
    },
    {
      ...defaults,
      id: "role_copywriter",
      name: "Копирайтер",
      description: "Наполняет страницы текстовым контентом",
      order: 2,
      isLocked: false,
      outputFormat: "freetext",
      includeNitPrompt: false,
      temperature: 0.7,
      systemPrompt: `Ты Копирайтер веб-студии. Ты получаешь структуру сайта от Архитектора и наполняешь её контентом.

Правила:
1. Для каждой секции каждой страницы напиши реальный контент (не lorem ipsum).
2. Учитывай цель секции (hero — цепляющий заголовок, features — описания, cta — призыв к действию).
3. Тексты должны быть связными, в едином tone of voice.
4. Формат ответа: для каждой страницы и секции укажи page slug, section id и текст.
5. Если в структуре указан стиль — адаптируй тональность под него.`,
    },
    {
      ...defaults,
      id: "role_coder",
      name: "Кодер",
      description: "Генерирует рабочий код сайта на основе структуры и контента",
      order: 3,
      isLocked: false,
      outputFormat: "freetext",
      includeNitPrompt: true,
      temperature: 0.3,
      systemPrompt: `Ты Кодер веб-студии. Твоя главная задача — сгенерировать полностью рабочий код сайта.

Ты получаешь от предыдущих агентов:
- Структуру проекта от Архитектора (JSON с описанием страниц, секций, навигации, дизайна)
- Текстовый контент от Копирайтера (тексты для каждой секции)

Правила:
1. Создай ПОЛНЫЙ рабочий код на основе полученной структуры и контента.
2. Используй РЕАЛЬНЫЕ тексты от Копирайтера — НЕ placeholder и НЕ lorem ipsum.
3. Следуй дизайну Архитектора: цвета, шрифты, стиль.
4. Реализуй ВСЕ секции из структуры.
5. Код должен быть production-ready: hover-эффекты, адаптивность, анимации.
6. Если структура или контент не получены — создай сайт по запросу пользователя самостоятельно.

Используй формат nitArtifact для вывода файлов.`,
    },
    {
      ...defaults,
      id: "role_tester",
      name: "Тестировщик",
      description: "Проверяет HTML/CSS/JS синтаксис и логику",
      order: 4,
      isLocked: false,
      outputFormat: "freetext",
      includeNitPrompt: false,
      temperature: 0.2,
      systemPrompt: `Ты Тестировщик веб-студии. Ты проверяешь результат работы предыдущих агентов.

Проверь:
1. HTML/CSS валидность — есть ли незакрытые теги, невалидные свойства
2. Семантика — правильно ли использованы теги (h1 один на страницу, alt у img)
3. Доступность (a11y) — контраст цветов, aria-атрибуты
4. SEO — meta title/description, og-теги, структура заголовков
5. Консистентность — совпадает ли контент со структурой Архитектора

Формат ответа:
- КРИТИЧЕСКИЕ ошибки (блокируют запуск)
- ПРЕДУПРЕЖДЕНИЯ (стоит исправить)
- РЕКОМЕНДАЦИИ (улучшения)
- ИТОГО: PASS / FAIL с кратким резюме`,
    },
  ];

  for (const role of seed) {
    roles.set(role.id, role);
  }

  logger.info("roleService", `Seeded ${seed.length} default roles`);
}

// ─── Public API ─────────────────────────────────────────────

export function getAllRoles(activeOnly = false): AgentRole[] {
  ensureSeed();
  const all = Array.from(roles.values());
  const filtered = activeOnly ? all.filter((r) => r.isActive) : all;
  return filtered.sort((a, b) => a.order - b.order);
}

export function getRoleById(id: string): AgentRole | null {
  ensureSeed();
  return roles.get(id) ?? null;
}

export function getLockedRole(): AgentRole | null {
  ensureSeed();
  return Array.from(roles.values()).find((r) => r.isLocked) ?? null;
}

export function createRole(data: Omit<AgentRole, "id" | "createdAt" | "updatedAt">): AgentRole {
  ensureSeed();

  // Check name uniqueness
  const existing = Array.from(roles.values()).find(
    (r) => r.name.toLowerCase() === data.name.toLowerCase(),
  );
  if (existing) {
    throw new Error(`Роль с именем "${data.name}" уже существует`);
  }

  const id = `role_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const role: AgentRole = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  };

  roles.set(id, role);
  logger.info("roleService", `Created role: ${role.name}`);
  return role;
}

export function updateRole(id: string, data: Partial<AgentRole>): AgentRole | null {
  ensureSeed();

  const existing = roles.get(id);
  if (!existing) return null;

  // Check name uniqueness (skip self)
  if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicate = Array.from(roles.values()).find(
      (r) => r.id !== id && r.name.toLowerCase() === data.name!.toLowerCase(),
    );
    if (duplicate) {
      throw new Error(`Роль с именем "${data.name}" уже существует`);
    }
  }

  // Protect locked fields
  if (existing.isLocked) {
    delete data.order;
    delete data.isLocked;
  }

  const prevPrompt = existing.systemPrompt;

  const updated: AgentRole = {
    ...existing,
    ...data,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  roles.set(id, updated);

  // Track prompt changes
  if (data.systemPrompt && data.systemPrompt !== prevPrompt) {
    const version = promptHistory.filter((h) => h.agentRoleId === id).length + 1;
    promptHistory.push({
      agentRoleId: id,
      systemPrompt: data.systemPrompt,
      version,
      createdAt: updated.updatedAt,
    });
  }

  logger.info("roleService", `Updated role: ${updated.name}`);
  return updated;
}

export function deleteRole(id: string): boolean {
  ensureSeed();

  const existing = roles.get(id);
  if (!existing) return false;
  if (existing.isLocked) {
    logger.warn("roleService", `Cannot delete locked role: ${existing.name}`);
    return false;
  }

  roles.delete(id);
  logger.info("roleService", `Deleted role: ${existing.name}`);
  return true;
}

export function reorderRoles(orderedIds: string[]): void {
  ensureSeed();

  // Find the highest order among locked roles
  const maxLockedOrder = Array.from(roles.values())
    .filter((r) => r.isLocked)
    .reduce((max, r) => Math.max(max, r.order), 0);

  // Assign orders starting after locked roles
  orderedIds.forEach((id, index) => {
    const role = roles.get(id);
    if (role && !role.isLocked) {
      role.order = maxLockedOrder + index + 1;
      role.updatedAt = new Date().toISOString();
    }
  });
}

export function getPromptHistory(roleId: string): PromptHistoryEntry[] {
  return promptHistory
    .filter((h) => h.agentRoleId === roleId)
    .sort((a, b) => b.version - a.version);
}
