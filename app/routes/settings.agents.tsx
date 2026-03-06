import { useState, useEffect, useCallback } from "react";
import type { AgentRole } from "@shared/types/agentRole";
import type { AIAgent } from "@shared/types/agent";
import { SacredBackground } from "~/components/ui/SacredBackground";
import { NeonButton } from "~/components/ui/NeonButton";
import { GlowText } from "~/components/ui/GlowText";
import { AgentRoleCard } from "~/components/settings/agents/AgentRoleCard";
import { AgentRoleForm } from "~/components/settings/agents/AgentRoleForm";
import { PromptTester } from "~/components/settings/agents/PromptTester";
import { PromptHistory } from "~/components/settings/agents/PromptHistory";

export default function SettingsAgentsPage() {
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [providers, setProviders] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AgentRole | null>(null);
  const [testingRole, setTestingRole] = useState<AgentRole | null>(null);
  const [historyRole, setHistoryRole] = useState<AgentRole | null>(null);
  const [formPromptOverride, setFormPromptOverride] = useState<string | null>(null);

  // Drag & drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, agentsRes] = await Promise.all([
        fetch("/api/roles"),
        fetch("/api/agents"),
      ]);
      const rolesData = await rolesRes.json();
      const agentsData = await agentsRes.json();
      setRoles(rolesData.roles ?? []);
      setProviders(agentsData.agents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = () => {
    setEditingRole(null);
    setFormPromptOverride(null);
    setFormOpen(true);
  };

  const handleEdit = (role: AgentRole) => {
    setEditingRole(role);
    setFormPromptOverride(null);
    setFormOpen(true);
  };

  const handleDelete = async (role: AgentRole) => {
    if (!confirm(`Удалить роль "${role.name}"?`)) return;
    try {
      const res = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete");
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleSave = async (data: Partial<AgentRole>) => {
    if (editingRole) {
      // Update
      const res = await fetch(`/api/roles/${editingRole.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error ?? "Update failed");
      }
    } else {
      // Create
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error ?? "Create failed");
      }
    }
    await loadData();
  };

  const handleRestorePrompt = (prompt: string) => {
    // Re-open edit form with restored prompt
    if (historyRole) {
      setEditingRole(historyRole);
      setFormPromptOverride(prompt);
      setFormOpen(true);
    }
  };

  const isProviderOnline = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    return provider?.status === "online";
  };

  const handleDrop = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    // Don't allow moving locked roles
    const fromRole = roles[fromIndex];
    if (!fromRole || fromRole.isLocked) return;

    // Reorder locally first (optimistic)
    const newRoles = [...roles];
    const [moved] = newRoles.splice(fromIndex, 1);
    newRoles.splice(toIndex, 0, moved!);
    setRoles(newRoles);

    // Send reorder to server (excluding locked roles from reorder list)
    const orderedIds = newRoles.filter((r) => !r.isLocked).map((r) => r.id);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error("Reorder failed");
      // Reload to get updated order numbers
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed");
      await loadData(); // Revert to server state
    }
  };

  return (
    <SacredBackground pattern="flower" className="min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <GlowText as="h1" variant="gold" className="text-xl mb-1">
              Роли агентов
            </GlowText>
            <p className="text-text-muted text-xs">
              Настройка ролей для multi-agent pipeline
            </p>
          </div>
          <div className="flex gap-2">
            <NeonButton variant="ghost" size="sm" onClick={() => window.history.back()}>
              ← Назад
            </NeonButton>
            <NeonButton variant="primary" size="sm" onClick={handleCreate}>
              + Новая роль
            </NeonButton>
          </div>
        </div>

        {/* Provider status bar */}
        <div className="glass rounded-lg p-3 border border-border-subtle mb-6">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-heading uppercase tracking-wider text-text-muted">
              Провайдеры:
            </span>
            {providers.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    p.status === "online" ? "bg-neon-emerald" : "bg-red-400"
                  }`}
                />
                <span className={p.status === "online" ? "text-text-primary" : "text-text-muted"}>
                  {p.name}
                </span>
                <span className="text-text-muted">({p.models.length})</span>
              </div>
            ))}
            {providers.length === 0 && (
              <span className="text-text-muted text-[11px]">Нет провайдеров</span>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="glass rounded-lg px-4 py-3 border border-red-400/20 mb-6">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <p className="text-text-muted text-sm animate-pulse">Загрузка ролей...</p>
          </div>
        )}

        {/* Role list */}
        {!loading && (
          <div className="space-y-4">
            {roles.map((role, index) => (
              <AgentRoleCard
                key={role.id}
                role={role}
                providerOnline={isProviderOnline(role.providerId)}
                onEdit={() => handleEdit(role)}
                onDelete={() => handleDelete(role)}
                onTest={() => setTestingRole(role)}
                onHistory={() => setHistoryRole(role)}
                isDragging={dragIndex === index}
                isDragOver={dragOverIndex === index}
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                onDrop={() => {
                  if (dragIndex !== null) handleDrop(dragIndex, index);
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
              />
            ))}
            {roles.length === 0 && (
              <div className="text-center py-12">
                <p className="text-text-muted text-sm mb-4">Роли не найдены.</p>
                <NeonButton variant="primary" size="sm" onClick={handleCreate}>
                  Создать первую роль
                </NeonButton>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AgentRoleForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingRole(null);
          setFormPromptOverride(null);
        }}
        onSave={handleSave}
        role={editingRole}
        providers={providers}
        promptOverride={formPromptOverride}
      />

      {testingRole && (
        <PromptTester
          open={!!testingRole}
          onClose={() => setTestingRole(null)}
          role={testingRole}
        />
      )}

      {historyRole && (
        <PromptHistory
          open={!!historyRole}
          onClose={() => setHistoryRole(null)}
          roleId={historyRole.id}
          roleName={historyRole.name}
          onRestore={handleRestorePrompt}
        />
      )}
    </SacredBackground>
  );
}
