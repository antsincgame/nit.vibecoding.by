import { Client, Databases, ID, Query, Permission, Role } from "node-appwrite";
import { logger } from "~/lib/utils/logger";

const SCOPE = "appwrite";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

let clientInstance: Client | null = null;

function getClient(): Client {
  if (clientInstance) return clientInstance;

  clientInstance = new Client()
    .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
    .setProject(requireEnv("APPWRITE_PROJECT_ID"))
    .setKey(requireEnv("APPWRITE_API_KEY"));

  return clientInstance;
}

let dbInstance: Databases | null = null;

export function getDb(): Databases {
  if (dbInstance) return dbInstance;
  dbInstance = new Databases(getClient());
  return dbInstance;
}

export function getMasterDbId(): string {
  return requireEnv("APPWRITE_MASTER_DB_ID");
}

export const COLLECTIONS = {
  PROJECTS: "projects",
  CHAT_MESSAGES: "chat_messages",
  VERSIONS: "versions",
  AGENT_ROLES: "agent_roles",
  PROMPT_HISTORY: "prompt_history",
  PIPELINE_LOGS: "pipeline_logs",
} as const;

// Appwrite 1.7.4: "create" не допускается для документов. Используем read, update, delete (без write — он может включать create).
const PERMISSIONS_ANY = [
  Permission.read(Role.any()),
  Permission.update(Role.any()),
  Permission.delete(Role.any()),
];

async function collectionExists(
  db: Databases,
  databaseId: string,
  collectionId: string,
): Promise<boolean> {
  try {
    await db.getCollection(databaseId, collectionId);
    return true;
  } catch {
    return false;
  }
}

async function databaseExists(
  db: Databases,
  databaseId: string,
): Promise<boolean> {
  try {
    await db.get(databaseId);
    return true;
  } catch {
    return false;
  }
}

export async function ensureMasterSchema(): Promise<void> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  if (!(await databaseExists(db, masterDbId))) {
    await db.create(masterDbId, "NIT Master");
    logger.info(SCOPE, `Created master database: ${masterDbId}`);
  }

  if (!(await collectionExists(db, masterDbId, COLLECTIONS.PROJECTS))) {
    await db.createCollection(masterDbId, COLLECTIONS.PROJECTS, "Projects", PERMISSIONS_ANY);

    const dbId = masterDbId;
    const collId = COLLECTIONS.PROJECTS;
    await db.createStringAttribute(dbId, collId, "name", 256, true);
    await db.createStringAttribute(dbId, collId, "description", 4096, false, "");
    await db.createStringAttribute(dbId, collId, "type", 32, false, "react");
    await db.createStringAttribute(dbId, collId, "agent_id", 128, false, "");
    await db.createStringAttribute(dbId, collId, "model_used", 128, false, "");
    await db.createStringAttribute(dbId, collId, "database_id", 64, true);
    await db.createStringAttribute(dbId, collId, "created_at", 64, true);
    await db.createStringAttribute(dbId, collId, "updated_at", 64, true);
    
    // Wait for attributes to be created
    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info(SCOPE, "Created projects collection in master DB");
  } else {
    try {
      const dbId = masterDbId;
      const collId = COLLECTIONS.PROJECTS;
      try { await db.createStringAttribute(dbId, collId, "type", 32, false, "react"); } catch { /* ignore if exists */ }
      try { await db.createStringAttribute(dbId, collId, "agent_id", 128, false, ""); } catch { /* ignore if exists */ }
      try { await db.createStringAttribute(dbId, collId, "model_used", 128, false, ""); } catch { /* ignore if exists */ }
      try { await db.createStringAttribute(dbId, collId, "database_id", 64, true); } catch { /* ignore if exists */ }
      try { await db.createStringAttribute(dbId, collId, "created_at", 64, true); } catch { /* ignore if exists */ }
      try { await db.createStringAttribute(dbId, collId, "updated_at", 64, true); } catch { /* ignore if exists */ }
    } catch (err) {
      logger.error(SCOPE, "Error checking/creating attributes", err);
    }
  }

  await ensureAgentRolesSchema();
  await ensurePipelineLogsSchema();
}

export async function ensureAgentRolesSchema(): Promise<void> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  if (!(await collectionExists(db, masterDbId, COLLECTIONS.AGENT_ROLES))) {
    await db.createCollection(masterDbId, COLLECTIONS.AGENT_ROLES, "Agent Roles", PERMISSIONS_ANY);

    const dbId = masterDbId;
    const collId = COLLECTIONS.AGENT_ROLES;
    await db.createStringAttribute(dbId, collId, "name", 256, true);
    await db.createStringAttribute(dbId, collId, "description", 4096, false, "");
    await db.createStringAttribute(dbId, collId, "system_prompt", 51200, false, "");
    await db.createStringAttribute(dbId, collId, "provider_id", 128, false, "ollama");
    await db.createStringAttribute(dbId, collId, "model_name", 128, false, "mistral");
    await db.createIntegerAttribute(dbId, collId, "order", false);
    await db.createBooleanAttribute(dbId, collId, "is_active", false, true);
    await db.createBooleanAttribute(dbId, collId, "is_locked", false, false);
    await db.createIntegerAttribute(dbId, collId, "timeout_ms", false);
    await db.createIntegerAttribute(dbId, collId, "max_retries", false);
    await db.createStringAttribute(dbId, collId, "output_format", 32, false, "freetext");
    await db.createBooleanAttribute(dbId, collId, "include_nit_prompt", false, false);
    await db.createFloatAttribute(dbId, collId, "temperature", false);
    await db.createStringAttribute(dbId, collId, "created_at", 64, false, "");
    await db.createStringAttribute(dbId, collId, "updated_at", 64, false, "");

    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info(SCOPE, "Created agent_roles collection in master DB");
  }

  if (!(await collectionExists(db, masterDbId, COLLECTIONS.PROMPT_HISTORY))) {
    await db.createCollection(masterDbId, COLLECTIONS.PROMPT_HISTORY, "Prompt History", PERMISSIONS_ANY);

    const dbId = masterDbId;
    const collId = COLLECTIONS.PROMPT_HISTORY;
    await db.createStringAttribute(dbId, collId, "agent_role_id", 128, true);
    await db.createStringAttribute(dbId, collId, "system_prompt", 51200, false, "");
    await db.createIntegerAttribute(dbId, collId, "version", false);
    await db.createStringAttribute(dbId, collId, "created_at", 64, false, "");

    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info(SCOPE, "Created prompt_history collection in master DB");
  }

  await seedDefaultRoles();
}

export async function ensurePipelineLogsSchema(): Promise<void> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  if (!(await collectionExists(db, masterDbId, COLLECTIONS.PIPELINE_LOGS))) {
    await db.createCollection(masterDbId, COLLECTIONS.PIPELINE_LOGS, "Pipeline Logs", PERMISSIONS_ANY);

    const dbId = masterDbId;
    const collId = COLLECTIONS.PIPELINE_LOGS;
    await db.createStringAttribute(dbId, collId, "session_id", 128, true);
    await db.createStringAttribute(dbId, collId, "project_id", 128, false, "");
    await db.createStringAttribute(dbId, collId, "agent_name", 256, false, "");
    await db.createStringAttribute(dbId, collId, "agent_role_id", 128, false, "");
    await db.createStringAttribute(dbId, collId, "provider_id", 128, false, "");
    await db.createStringAttribute(dbId, collId, "model_name", 128, false, "");
    await db.createIntegerAttribute(dbId, collId, "input_length", false);
    await db.createIntegerAttribute(dbId, collId, "output_length", false);
    await db.createIntegerAttribute(dbId, collId, "duration_ms", false);
    await db.createStringAttribute(dbId, collId, "selected_by", 64, false, "");
    await db.createStringAttribute(dbId, collId, "status", 32, false, "");
    await db.createStringAttribute(dbId, collId, "error_message", 4096, false, "");
    await db.createIntegerAttribute(dbId, collId, "retry_count", false);
    await db.createStringAttribute(dbId, collId, "timestamp", 64, false, "");

    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info(SCOPE, "Created pipeline_logs collection in master DB");
  }
}

export type SeedLlmOptions = {
  providerId?: string;
  modelName?: string;
};

export async function seedOrCreateDefaultRoles(
  llmOptions?: SeedLlmOptions,
): Promise<{ seeded: boolean; message: string }> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  try {
    const existing = await db.listDocuments(masterDbId, COLLECTIONS.AGENT_ROLES, [Query.limit(1)]);
    if (existing.total > 0) {
      return { seeded: false, message: "Роли уже существуют" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(SCOPE, "Failed to list roles (check connection)", err);
    return {
      seeded: false,
      message: `Ошибка подключения к Appwrite: ${msg.slice(0, 150)}. Проверьте APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY.`,
    };
  }

  const now = new Date().toISOString();
  const providerId = llmOptions?.providerId?.trim() || "ollama";
  const modelName = llmOptions?.modelName?.trim() || "mistral";

  const defaults = {
    provider_id: providerId,
    model_name: modelName,
    is_active: true,
    timeout_ms: 60_000,
    max_retries: 2,
    created_at: now,
    updated_at: now,
  };

  const ROLE_IDS = [
    "role_analyst",
    "role_architect",
    "role_designer",
    "role_copywriter",
    "role_coder",
    "role_tester",
  ] as const;

  const seeds: Array<Record<string, unknown> & { name: string; role_id: string }> = [
    {
      ...defaults,
      role_id: ROLE_IDS[0],
      name: "Аналитик",
      description: "Уточнение требований, анализ запроса пользователя",
      order: 1,
      is_locked: false,
      output_format: "freetext",
      include_nit_prompt: false,
      temperature: 0.4,
      system_prompt: `Ты Аналитик веб-студии — эксперт по сбору и структурированию требований. Твоя задача — превратить размытый запрос пользователя в чёткий, приоритизированный бриф для команды агентов.

ИДЕНТИЧНОСТЬ:
Ты первый в цепочке агентов. От качества твоего брифа зависит успех всего проекта. Ты задаёшь вопросы, выявляешь неочевидные потребности и формулируешь измеримые критерии успеха.

ПРОТОКОЛ РАБОТЫ:
1. Проанализируй запрос: что пользователь хочет получить, какие проблемы решить.
2. Выяви целевую аудиторию: демография, потребности, контекст использования.
3. Определи ключевые страницы и функциональность с приоритизацией (must-have / nice-to-have).
4. Сформулируй user stories для ключевых сценариев (формат: «Как [роль], я хочу [действие], чтобы [результат]»).
5. Укажи ограничения: технические, временные, бюджетные (если применимо).
6. Добавь рекомендации для Архитектора: что учесть в структуре, навигации, UX.

ФОРМАТ ОТВЕТА (строго структурированный текст):
- ЦЕЛИ: [1–3 измеримые цели проекта]
- АУДИТОРИЯ: [описание ЦА, ключевые потребности]
- КЛЮЧЕВЫЕ СТРАНИЦЫ: [список с приоритетами]
- USER STORIES: [2–5 ключевых сценариев]
- ОГРАНИЧЕНИЯ: [если есть]
- РЕКОМЕНДАЦИИ ДЛЯ АРХИТЕКТОРА: [что учесть]`,
    },
    {
      ...defaults,
      role_id: ROLE_IDS[1],
      name: "Архитектор",
      description: "Создаёт структуру, навигацию, UX, цвета",
      order: 2,
      is_locked: true,
      output_format: "json",
      include_nit_prompt: false,
      temperature: 0.3,
      system_prompt: `Ты Архитектор веб-студии — эксперт по информационной архитектуре и UX. Твоя задача — превратить бриф Аналитика в детальную техническую спецификацию для Кодера.

ИДЕНТИЧНОСТЬ:
Ты создаёшь структуру проекта: страницы, секции, навигацию, дизайн-токены. Твой вывод — единственный источник правды для Дизайнера, Копирайтера и Кодера.

ПРОТОКОЛ:
1. Изучи бриф от Аналитика (цели, аудитория, ключевые страницы).
2. Определи иерархию страниц и их назначение.
3. Для каждой страницы спроектируй секции: hero, features, cta, content, gallery, form, footer, header, testimonials, pricing, faq.
4. Задай навигацию: top | sidebar | burger и пункты меню.
5. Предложи design tokens: primary_color, secondary_color, accent_color, font_heading, font_body, style (minimal | corporate | creative | bold).

ФОРМАТ ВЫВОДА — СТРОГО JSON (без markdown, без пояснений):
{
  "project_name": "string",
  "pages": [{"slug": "string", "title": "string", "purpose": "string", "sections": [{"id": "string", "type": "hero|features|cta|content|gallery|form|footer|header|testimonials|pricing|faq", "description": "string", "notes": "string"}]}],
  "navigation": {"type": "top|sidebar|burger", "items": [{"label": "string", "href": "string"}]},
  "design": {"style": "string", "primary_color": "#hex", "secondary_color": "#hex", "accent_color": "#hex", "font_heading": "string", "font_body": "string"},
  "tech_notes": "string"
}

ПРАВИЛА:
- Один valid JSON объект. Никакого текста до или после.
- Учитывай responsive: секции должны работать на mobile и desktop.
- SEO: slug — человекопонятный, title — для meta.
- Accessibility: предусмотри логичную структуру заголовков (h1→h2→h3).`,
    },
    {
      ...defaults,
      role_id: ROLE_IDS[2],
      name: "Дизайнер",
      description: "Визуальный стиль, цвета, типографика, компоненты",
      order: 3,
      is_locked: false,
      output_format: "freetext",
      include_nit_prompt: false,
      temperature: 0.5,
      system_prompt: `Ты Дизайнер веб-студии с экспертизой в UI/UX и дизайн-системах. Ты получаешь JSON-структуру от Архитектора и создаёшь полную визуальную спецификацию для Кодера.

ИДЕНТИЧНОСТЬ:
Ты превращаешь абстрактную структуру в конкретную дизайн-систему: цвета, типографика, spacing, компоненты, анимации. Твоя спецификация должна позволить Кодеру реализовать интерфейс без догадок.

ПРОТОКОЛ РАБОТЫ:
1. Изучи структуру Архитектора: project_name, pages, design.style, tech_notes.
2. Определи палитру: primary (основной бренд), secondary (фоны, акценты), accent (CTA, ссылки). Всегда указывай hex-коды.
3. Подбери шрифты: font_heading (заголовки), font_body (текст). Используй Google Fonts или системные (Inter, Roboto, system-ui).
4. Опиши spacing: базовый unit (4px/8px), отступы секций, padding компонентов.
5. Специфицируй компоненты: кнопки (размеры, скругления, тени), карточки, формы, инпуты.
6. Рекомендации по анимациям: hover (transform, opacity), transitions (duration, easing), микро-взаимодействия.
7. Если в структуре указан dark mode — опиши цветовую схему для тёмной темы.

ФОРМАТ ОТВЕТА (структурированный текст):
- ПАЛИТРА: primary #hex, secondary #hex, accent #hex [, dark mode варианты]
- ШРИФТЫ: heading (название, fallback), body (название, fallback)
- SPACING: unit, section-gap, component-padding
- КОМПОНЕНТЫ: [кнопки, карточки, формы — размеры, скругления, тени]
- АНИМАЦИИ: [hover, transitions, рекомендации]
- ОСОБЕННОСТИ: [если нужны кастомные элементы]`,
    },
    {
      ...defaults,
      role_id: ROLE_IDS[3],
      name: "Копирайтер",
      description: "Наполняет страницы текстовым контентом",
      order: 4,
      is_locked: false,
      output_format: "freetext",
      include_nit_prompt: false,
      temperature: 0.7,
      system_prompt: `Ты Копирайтер веб-студии. Эксперт по контенту и конверсии. Ты получаешь структуру от Архитектора и визуальную спецификацию от Дизайнера. Твоя задача — наполнить каждую секцию продающим, SEO-оптимизированным контентом.

ИДЕНТИЧНОСТЬ:
Ты пишешь для веб-проектов: лендинги, корпоративные сайты, портфолио. Тексты должны продавать, информировать и вовлекать. Никакого lorem ipsum — только реальный, осмысленный контент.

ПРОТОКОЛ РАБОТЫ:
1. Изучи структуру Архитектора: страницы, секции, цели каждой секции.
2. Учти визуальный стиль Дизайнера: tone of voice должен соответствовать (премиум — сдержанно, стартап — энергично, корпорация — надёжно).
3. Для каждой секции напиши контент с учётом её цели: hero — цепляющий заголовок + подзаголовок, features — 3–5 преимуществ с заголовками, cta — призыв к действию, testimonials — отзывы.
4. SEO: заголовки H1–H3 с ключевыми словами, meta-описания для страниц.
5. CTA-формулы: глагол + выгода (например: «Получить консультацию», «Заказать демо»).

ФОРМАТ ОТВЕТА:
Для каждой страницы и секции укажи:
- page_slug: [slug страницы]
- section_id: [id секции]
- heading: [заголовок]
- body: [основной текст]
- cta_text: [если применимо]

ПРАВИЛА КАЧЕСТВА:
- Единый tone of voice на всём сайте.
- Короткие абзацы (2–3 предложения).
- Конкретика вместо общих фраз.
- Учёт целевой аудитории из брифа Аналитика.`,
    },
    {
      ...defaults,
      role_id: ROLE_IDS[4],
      name: "Кодер",
      description: "Генерирует рабочий код сайта на основе структуры и контента",
      order: 5,
      is_locked: false,
      output_format: "freetext",
      include_nit_prompt: true,
      temperature: 0.3,
      system_prompt: `Ты Кодер веб-студии — эксперт по генерации production-ready кода. Твоя задача — превратить структуру, дизайн и контент в полностью рабочий сайт.

ИДЕНТИЧНОСТЬ:
Ты senior-разработчик с опытом React, Tailwind CSS, семантичного HTML. Ты пишешь чистый, читаемый код без лишних зависимостей. Ты строго следуешь инструкциям NIT (nitArtifact, nitAction) для вывода файлов.

ВХОДНЫЕ ДАННЫЕ (от предыдущих агентов):
- Архитектор: JSON со страницами, секциями, навигацией, design (primary_color, font_heading и т.д.)
- Дизайнер: палитра, шрифты, стиль компонентов, анимации
- Копирайтер: реальные тексты для каждой секции (page slug, section id, текст)

ПРОТОКОЛ РАБОТЫ:
1. Собери все данные из контекста. Если чего-то нет — создай разумные значения по запросу пользователя.
2. Используй ТОЛЬКО реальные тексты от Копирайтера. Запрещено: lorem ipsum, placeholder, "текст здесь".
3. Применяй цвета и шрифты из design. Используй Tailwind: text-[#hex], font-[name], rounded-lg, shadow-lg.
4. Реализуй ВСЕ секции из структуры: hero, features, cta, footer, header и т.д.
5. Добавь hover-эффекты (hover:scale-105, hover:bg-opacity-90), transitions (transition-all duration-300).
6. Адаптивность: mobile-first, sm:, md:, lg: breakpoints. Навигация: burger на мобильных, top на десктопе.
7. Доступность: alt у img, aria-label у кнопок, семантика (header, main, footer, nav).
8. Вывод СТРОГО в формате nitArtifact. Каждый файл — отдельный nitAction type="file".

КАЧЕСТВО:
- Код должен запускаться без доработок. Никаких TODO, FIXME, заглушек.
- Один h1 на страницу. Логичная иерархия заголовков (h2, h3).
- Консистентность: единый стиль кнопок, карточек, отступов (p-4, gap-4, space-y-6).`,
    },
    {
      ...defaults,
      role_id: ROLE_IDS[5],
      name: "Тестировщик",
      description: "Проверяет HTML/CSS/JS синтаксис и логику",
      order: 6,
      is_locked: false,
      output_format: "freetext",
      include_nit_prompt: false,
      temperature: 0.2,
      system_prompt: `Ты Тестировщик веб-студии — QA-эксперт по фронтенду. Твоя задача — провести полную проверку результата работы предыдущих агентов и вынести вердикт: PASS или FAIL.

ИДЕНТИЧНОСТЬ:
Ты — последнее звено в цепочке агентов. От твоей проверки зависит, попадёт ли сайт в production. Ты строг, но справедлив. Ты ищешь реальные проблемы, а не придираешься к мелочам.

ПРОТОКОЛ ПРОВЕРКИ (выполняй по порядку):

1. HTML/CSS валидность
   - Незакрытые теги, непарные скобки
   - Невалидные CSS-свойства, устаревшие префиксы
   - Синтаксические ошибки в JS (если есть inline-скрипты)

2. Семантика
   - Один h1 на страницу
   - Корректная иерархия h2–h6
   - alt у всех img
   - Семантические теги: header, main, footer, nav, section, article

3. Доступность (a11y)
   - Контраст текста и фона (минимум 4.5:1 для обычного текста)
   - aria-label / aria-labelledby где нужно
   - Фокус на интерактивных элементах
   - Формы: label, placeholder, error states

4. SEO
   - meta title и description на каждой странице
   - og:title, og:description для соцсетей
   - Структура заголовков (h1 → h2 → h3)
   - Canonical URL при необходимости

5. Консистентность
   - Соответствие контента структуре Архитектора
   - Использование текстов Копирайтера (не placeholder)
   - Соответствие дизайну (цвета, шрифты)

6. Производительность и качество
   - Нет тяжёлых блокирующих операций
   - Адаптивность (mobile-first)
   - Hover-состояния у кнопок и ссылок

ФОРМАТ ОТВЕТА (строго):
- КРИТИЧЕСКИЕ: [список или «нет»]
- ПРЕДУПРЕЖДЕНИЯ: [список или «нет»]
- РЕКОМЕНДАЦИИ: [список или «нет»]
- ИТОГО: PASS / FAIL

Вердикт FAIL — только если есть критические ошибки, блокирующие запуск или нарушающие доступность.`,
    },
  ];

  let created = 0;
  let lastError: string | null = null;
  for (const seed of seeds) {
    const { role_id, ...data } = seed;
    try {
      await db.createDocument(masterDbId, COLLECTIONS.AGENT_ROLES, role_id, data, PERMISSIONS_ANY);
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      logger.error(SCOPE, `Failed to seed role: ${seed.name}`, err);
    }
  }

  if (created === 0) {
    const hint = lastError
      ? ` Детали: ${lastError.slice(0, 200)}`
      : " Проверьте APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY в .env. API Key должен иметь права databases.*";
    return {
      seeded: false,
      message: `Не удалось создать роли. Проверьте подключение к Appwrite и переменные окружения.${hint}`,
    };
  }

  logger.info(SCOPE, `Seeded ${created}/${seeds.length} default agent roles`);
  return { seeded: true, message: `Создано ${created} ролей по умолчанию` };
}

export async function seedOrCreateDefaultRolesForce(
  llmOptions?: SeedLlmOptions,
): Promise<{ seeded: boolean; message: string }> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  try {
    const existing = await db.listDocuments(masterDbId, COLLECTIONS.AGENT_ROLES, [Query.limit(500)]);
    for (const doc of existing.documents) {
      await db.deleteDocument(masterDbId, COLLECTIONS.AGENT_ROLES, doc.$id);
    }
  } catch (err) {
    logger.error(SCOPE, "Failed to delete existing roles", err);
    return { seeded: false, message: "Ошибка при удалении ролей" };
  }

  return seedOrCreateDefaultRoles(llmOptions);
}

async function seedDefaultRoles(): Promise<void> {
  await seedOrCreateDefaultRoles();
}

export async function createProjectDatabase(projectName: string): Promise<string> {
  const db = getDb();
  const dbId = ID.unique();

  await db.create(dbId, `Project: ${projectName}`);

  await createProjectCollections(db, dbId);

  logger.info(SCOPE, `Created project database: ${dbId}`);
  return dbId;
}

async function createProjectCollections(db: Databases, dbId: string): Promise<void> {
  await db.createCollection(dbId, COLLECTIONS.CHAT_MESSAGES, "Chat Messages", PERMISSIONS_ANY);

  const msgColl = COLLECTIONS.CHAT_MESSAGES;
  await db.createStringAttribute(dbId, msgColl, "role", 16, true);
  await db.createStringAttribute(dbId, msgColl, "content", 1048576, true);
  await db.createIntegerAttribute(dbId, msgColl, "timestamp", true);
  await db.createStringAttribute(dbId, msgColl, "model", 128, false);
  await db.createStringAttribute(dbId, msgColl, "agent_id", 128, false);
  await db.createStringAttribute(dbId, msgColl, "agent_role_id", 128, false);
  await db.createStringAttribute(dbId, msgColl, "agent_role_name", 256, false);
  await db.createStringAttribute(dbId, msgColl, "selected_by", 64, false);
  await db.createIntegerAttribute(dbId, msgColl, "duration_ms", false);

  await db.createCollection(dbId, COLLECTIONS.VERSIONS, "Versions", PERMISSIONS_ANY);

  const verColl = COLLECTIONS.VERSIONS;
  await db.createStringAttribute(dbId, verColl, "code", 1048576, true);
  await db.createStringAttribute(dbId, verColl, "prompt", 1048576, true);
  await db.createStringAttribute(dbId, verColl, "model", 128, true);
  await db.createStringAttribute(dbId, verColl, "agent_id", 128, false, "");
  await db.createFloatAttribute(dbId, verColl, "temperature", true);
  await db.createIntegerAttribute(dbId, verColl, "version_number", true);
  await db.createStringAttribute(dbId, verColl, "created_at", 64, true);

  // Wait for attributes to be created
  await new Promise(resolve => setTimeout(resolve, 3000));
}

export async function deleteProjectDatabase(dbId: string): Promise<void> {
  const db = getDb();
  await db.delete(dbId);
  logger.info(SCOPE, `Deleted project database: ${dbId}`);
}

export { ID, Query };
