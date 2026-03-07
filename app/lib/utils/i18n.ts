import { useSettingsStore } from "~/lib/stores/settingsStore";

const translations: Record<string, Record<string, string>> = {
  "chat.welcome.title": { ru: "NIT.BY", en: "NIT.BY" },
  "chat.welcome.subtitle": {
    ru: "Опишите приложение на естественном языке.\nЛокальная LLM сгенерирует код в реальном времени.",
    en: "Describe an app in natural language.\nA local LLM will generate code in real time.",
  },
  "chat.no_agents": {
    ru: "Нет доступных AI агентов. Запустите Ollama или LM Studio.",
    en: "No AI agents available. Start Ollama or LM Studio.",
  },
  "chat.placeholder": {
    ru: "Опишите, что нужно создать...\n(Ctrl+Enter для отправки)",
    en: "Describe what to build...\n(Ctrl+Enter to send)",
  },
  "chat.generate": { ru: "Генерировать", en: "Generate" },
  "chat.stop": { ru: "Стоп", en: "Stop" },
  "chat.code_generated": { ru: "Код сгенерирован", en: "Code generated" },
  "chat.generating": { ru: "Генерация кода...", en: "Generating code..." },
  "chat.thinking": { ru: "Думаю...", en: "Thinking..." },
  "chat.chars": { ru: "символов", en: "chars" },

  "workbench.no_files": { ru: "Нет файлов", en: "No files" },
  "workbench.files": { ru: "файлов", en: "files" },
  "workbench.copy": { ru: "Копировать", en: "Copy" },
  "workbench.format": { ru: "Формат", en: "Format" },
  "workbench.export": { ru: "Экспорт ZIP", en: "Export ZIP" },
  "workbench.code_here": { ru: "Код появится здесь", en: "Code will appear here" },

  "preview.title": { ru: "Превью", en: "Preview" },
  "preview.streaming": { ru: "обновление...", en: "streaming..." },
  "preview.updating": { ru: "Обновление...", en: "Updating..." },
  "preview.placeholder": { ru: "Превью появится здесь", en: "Preview will appear here" },
  "preview.retry": { ru: "Повторить", en: "Retry" },

  "sidebar.agents": { ru: "Агенты", en: "Agents" },
  "sidebar.scanning": { ru: "Сканирование...", en: "Scanning..." },
  "sidebar.no_agents": { ru: "Нет агентов", en: "No agents" },
  "sidebar.online": { ru: "онлайн", en: "online" },
  "sidebar.history": { ru: "История", en: "History" },
  "sidebar.projects": { ru: "Проекты", en: "Projects" },
  "sidebar.new_project": { ru: "+ Новый", en: "+ New" },

  "common.loading": { ru: "Загрузка...", en: "Loading..." },
  "common.back": { ru: "Назад", en: "Back" },
  "common.cancel": { ru: "Отмена", en: "Cancel" },
  "common.create": { ru: "Создать", en: "Create" },
  "common.delete": { ru: "Удалить", en: "Delete" },
  "common.deleting": { ru: "Удаление...", en: "Deleting..." },
  "common.done": { ru: "Готово", en: "Done" },
  "common.reset_defaults": { ru: "Сброс", en: "Reset Defaults" },

  "project.search": { ru: "Поиск...", en: "Search..." },
  "project.no_matches": { ru: "Ничего не найдено", en: "No matches" },
  "project.no_projects": { ru: "Нет проектов", en: "No projects yet" },
  "project.new_project": { ru: "Новый проект", en: "New Project" },
  "project.name_label": { ru: "Название проекта", en: "Project Name" },
  "project.name_placeholder": { ru: "Моё крутое приложение", en: "My Awesome App" },
  "project.delete_title": { ru: "Удалить проект", en: "Delete Project" },
  "project.delete_confirm": { ru: "Вы уверены, что хотите удалить проект", en: "Are you sure you want to delete project" },

  "role.label": { ru: "Роль", en: "Role" },
  "role.no_roles": { ru: "Нет ролей", en: "No roles" },
  "role.auto": { ru: "🤖 Авто (LLM-роутер)", en: "🤖 Auto (LLM router)" },
  "role.chain": { ru: "⚡ Цепочка (все по порядку)", en: "⚡ Chain (all in order)" },
  "role.first_request_chain": { ru: "Первый запрос запускает полную цепочку", en: "First request runs full chain" },
  "role.selecting": { ru: "Выбор роли...", en: "Selecting role..." },
  "role.active": { ru: "Активна", en: "Active" },
  "role.inactive": { ru: "Неактивна", en: "Inactive" },
  "role.provider_offline": { ru: "Провайдер оффлайн", en: "Provider offline" },
  "role.locked": { ru: "заблокирована", en: "locked" },
  "role.code_mode": { ru: "код", en: "code" },
  "role.drag_hint": { ru: "Перетащите для сортировки", en: "Drag to reorder" },
  "role.edit": { ru: "Редактировать", en: "Edit" },
  "role.test": { ru: "Тест", en: "Test" },
  "role.history": { ru: "История", en: "History" },
  "role.new_role": { ru: "Новая роль", en: "New role" },

  "chain.title": { ru: "Цепочка", en: "Chain" },

  "version.no_versions": { ru: "Нет версий", en: "No versions yet" },
  "version.files": { ru: "файлов", en: "files" },

  "file.title": { ru: "Файлы", en: "Files" },
  "file.new": { ru: "Новый файл", en: "New file" },
  "file.no_files": { ru: "Файлы ещё не сгенерированы", en: "No files generated yet" },
  "file.rename": { ru: "Переименовать", en: "Rename" },

  "settings.title": { ru: "Настройки", en: "Settings" },
  "settings.default_agent": { ru: "Агент по умолчанию", en: "Default Agent" },
  "settings.default_model": { ru: "Модель по умолчанию", en: "Default Model" },
  "settings.default_temperature": { ru: "Температура по умолчанию", en: "Default Temperature" },
  "settings.default_project_type": { ru: "Тип проекта по умолчанию", en: "Default Project Type" },
  "settings.editor_font_size": { ru: "Размер шрифта редактора", en: "Editor Font Size" },
  "settings.language": { ru: "Язык", en: "Language" },
  "settings.auto_save": { ru: "Автосохранение версий", en: "Auto-save versions" },
  "settings.no_agents": { ru: "Нет агентов", en: "No agents" },
  "settings.section_llm": { ru: "LLM и цепочка", en: "LLM & Chain" },
  "settings.section_project": { ru: "Проект", en: "Project" },
  "settings.section_roles": { ru: "Роли агентов", en: "Agent Roles" },
  "settings.orchestrator_hint": {
    ru: "Используется для оркестрации цепочки и роутинга",
    en: "Used for chain orchestration and routing",
  },

  "context.label": { ru: "Контекст", en: "Context" },
  "context.choose_file": { ru: "Выбрать файл (.txt, .md, .json, .pdf, .docx)", en: "Choose file (.txt, .md, .json, .pdf, .docx)" },
  "context.truncated": { ru: "Обрезано до 10 000 символов", en: "Truncated to 10,000 chars" },
  "context.parsing": { ru: "Чтение...", en: "Reading..." },
  "context.clear": { ru: "Очистить", en: "Clear" },
};

export function t(key: string): string {
  const lang = useSettingsStore.getState().language;
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] ?? entry["en"] ?? key;
}

export function useT() {
  const lang = useSettingsStore((s) => s.language);
  return (key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[lang] ?? entry["en"] ?? key;
  };
}
