import { useState, useEffect } from "react";
import type { PromptHistoryEntry } from "@shared/types/agentRole";
import { NeonModal } from "~/components/ui/NeonModal";
import { NeonButton } from "~/components/ui/NeonButton";

interface PromptHistoryProps {
  open: boolean;
  onClose: () => void;
  roleId: string;
  roleName: string;
  onRestore: (prompt: string) => void;
}

export function PromptHistory({ open, onClose, roleId, roleName, onRestore }: PromptHistoryProps) {
  const [entries, setEntries] = useState<PromptHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !roleId) return;
    setLoading(true);
    fetch(`/api/roles/${encodeURIComponent(roleId)}?history=true`)
      .then((r) => r.json())
      .then((data) => setEntries(data.history ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [open, roleId]);

  return (
    <NeonModal open={open} onClose={onClose} title={`История промптов: ${roleName}`}>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {loading && <p className="text-text-muted text-xs animate-pulse">Загрузка...</p>}

        {!loading && entries.length === 0 && (
          <p className="text-text-muted text-xs">Нет истории изменений.</p>
        )}

        {entries.map((entry) => (
          <div
            key={`${entry.agentRoleId}-${entry.version}`}
            className="glass rounded p-3 border border-border-subtle space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">
                v{entry.version} — {new Date(entry.createdAt).toLocaleString("ru")}
              </span>
              <NeonButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  onRestore(entry.systemPrompt);
                  onClose();
                }}
              >
                Восстановить
              </NeonButton>
            </div>
            <pre className="text-[10px] text-text-secondary font-mono whitespace-pre-wrap line-clamp-4">
              {entry.systemPrompt}
            </pre>
          </div>
        ))}
      </div>
    </NeonModal>
  );
}
