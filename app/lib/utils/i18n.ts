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
  "chat.generate": { ru: "GENERATE", en: "GENERATE" },
  "chat.stop": { ru: "STOP", en: "STOP" },
  "chat.code_generated": { ru: "Код сгенерирован", en: "Code generated" },
  "chat.generating": { ru: "Генерация кода...", en: "Generating code..." },
  "chat.thinking": { ru: "Думаю...", en: "Thinking..." },

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
  "sidebar.new_project": { ru: "+ Сделай сайт про", en: "+ Create a site about" },
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
