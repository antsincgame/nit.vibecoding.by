const ROLE_ICONS: Record<string, string> = {
  "Архитектор": "🏗️",
  "Копирайтер": "✍️",
  "Кодер": "💻",
  "Тестировщик": "🧪",
  "Дизайнер": "🎨",
  "Аналитик": "📊",
  "DevOps": "🔧",
  "Менеджер": "📋",
};

export function getRoleIcon(roleName: string): string {
  return ROLE_ICONS[roleName] ?? roleName.charAt(0).toUpperCase();
}
