import type { AgentRole } from "@shared/types/agentRole";
import { NeonButton } from "~/components/ui/NeonButton";
import { cn } from "~/lib/utils/cn";

const ROLE_ICONS: Record<string, string> = {
  "Архитектор": "🏗️",
  "Копирайтер": "✍️",
  "Тестировщик": "🧪",
};

interface AgentRoleCardProps {
  role: AgentRole;
  providerOnline: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onHistory: () => void;
}

export function AgentRoleCard({
  role,
  providerOnline,
  onEdit,
  onDelete,
  onTest,
  onHistory,
}: AgentRoleCardProps) {
  const icon = ROLE_ICONS[role.name] ?? "🤖";

  return (
    <div className="glass rounded-lg border border-border-subtle p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="text-sm font-heading text-text-primary">{role.name}</h3>
          {role.isLocked && (
            <span className="text-[9px] px-1.5 py-0.5 bg-gold-pure/10 text-gold-pure rounded border border-gold-pure/20">
              🔒 locked
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">#{role.order}</span>
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              role.isActive
                ? providerOnline
                  ? "bg-neon-emerald"
                  : "bg-yellow-400"
                : "bg-red-400",
            )}
          />
          <span className="text-[10px] text-text-muted">
            {role.isActive ? (providerOnline ? "Active" : "Provider offline") : "Inactive"}
          </span>
        </div>
      </div>

      {/* Model info */}
      <div className="text-[11px] text-text-secondary">
        <span className="font-mono">{role.modelName}</span>
        <span className="text-text-muted"> @ {role.providerId}</span>
        <span className="text-text-muted ml-2">temp: {role.temperature}</span>
        <span className="text-text-muted ml-2">timeout: {role.timeoutMs / 1000}s</span>
      </div>

      {/* Description */}
      <p className="text-xs text-text-muted leading-relaxed">{role.description}</p>

      {/* Prompt preview */}
      <div className="bg-deep-space/60 rounded p-2 border border-border-subtle">
        <p className="text-[10px] text-text-muted font-mono line-clamp-2">
          {role.systemPrompt.slice(0, 150)}...
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <NeonButton variant="ghost" size="sm" onClick={onEdit}>
          Редактировать
        </NeonButton>
        <NeonButton variant="ghost" size="sm" onClick={onTest}>
          Тест
        </NeonButton>
        <NeonButton variant="ghost" size="sm" onClick={onHistory}>
          📜 История
        </NeonButton>
        {!role.isLocked && (
          <NeonButton variant="danger" size="sm" onClick={onDelete}>
            Удалить
          </NeonButton>
        )}
      </div>
    </div>
  );
}
