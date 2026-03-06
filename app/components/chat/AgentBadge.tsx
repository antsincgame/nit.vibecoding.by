import type { ChatMessage } from "@shared/types/message";
import { cn } from "~/lib/utils/cn";

const ROLE_ICONS: Record<string, string> = {
  "Архитектор": "🏗️",
  "Копирайтер": "✍️",
  "Тестировщик": "🧪",
};

export function AgentBadge({ message }: { message: ChatMessage }) {
  if (message.role !== "assistant" || !message.agentRoleName) return null;

  const icon = ROLE_ICONS[message.agentRoleName] ?? "🤖";
  const duration = message.durationMs
    ? `${(message.durationMs / 1000).toFixed(1)}с`
    : null;

  return (
    <div className="flex items-center gap-2 mb-1 text-[10px]">
      <span>{icon}</span>
      <span className="text-gold-pure font-heading tracking-wider">{message.agentRoleName}</span>
      {message.model && (
        <span className="text-text-muted">
          {message.model}@{message.agentId}
        </span>
      )}
      {message.selectedBy && (
        <span className="text-text-muted/60">
          [{message.selectedBy}]
        </span>
      )}
      {duration && (
        <span className="text-text-muted ml-auto">{duration}</span>
      )}
    </div>
  );
}
