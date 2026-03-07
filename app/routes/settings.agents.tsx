import { useState, useEffect, useCallback } from "react";
import type { AgentRole } from "@shared/types/agentRole";
import type { AIAgent } from "@shared/types/agent";
import { SacredBackground } from "~/components/ui/SacredBackground";
import { ParticleField } from "~/components/ui/ParticleField";
import { NeonButton } from "~/components/ui/NeonButton";
import { NeonInput } from "~/components/ui/NeonInput";
import { GlowText } from "~/components/ui/GlowText";
import { AgentRoleCard } from "~/components/settings/agents/AgentRoleCard";
import { AgentRoleForm } from "~/components/settings/agents/AgentRoleForm";
import { PromptTester } from "~/components/settings/agents/PromptTester";
import { PromptHistory } from "~/components/settings/agents/PromptHistory";
import { SettingsSection } from "~/components/settings/SettingsSection";
import { NeonSlider } from "~/components/settings/NeonSlider";
import { useAgentDiscovery } from "~/features/agents/hooks/useAgentDiscovery";
import { useSettingsStore } from "~/lib/stores/settingsStore";
import { useAgentStore } from "~/lib/stores/agentStore";
import { useT } from "~/lib/utils/i18n";

import { Link } from "react-router";

export default function SettingsAgentsPage() {
  useAgentDiscovery();
  const t = useT();
  const settings = useSettingsStore();
  const { agents, selection, setSelection } = useAgentStore();
  const selectedAgent = agents.find((a) => a.id === selection.agentId);

  const handleAgentChange = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    const modelId = agent?.models[0]?.id ?? "";
    setSelection({ agentId, modelId });
    settings.updateSettings({ defaultAgentId: agentId, defaultModelId: modelId });
  };

  const handleModelChange = (modelId: string) => {
    setSelection({ modelId });
    settings.updateSettings({ defaultModelId: modelId });
  };

  const handleTemperatureChange = (temperature: number) => {
    setSelection({ temperature });
    settings.updateSettings({ defaultTemperature: temperature });
  };
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
  const [seedLoading, setSeedLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      const [rolesRes, agentsRes] = await Promise.all([
        fetch("/api/roles", { signal: controller.signal }),
        fetch("/api/agents", { signal: controller.signal }),
      ]);
      clearTimeout(timeoutId);
      const rolesData = await rolesRes.json().catch(() => ({}));
      const agentsData = await agentsRes.json().catch(() => ({}));
      if (!rolesRes.ok) {
        setError((rolesData as { error?: string }).error ?? "Ошибка загрузки ролей");
        setRoles([]);
      } else {
        setRoles((rolesData as { roles?: AgentRole[] }).roles ?? []);
      }
      if (!agentsRes.ok) {
        setProviders([]);
      } else {
        setProviders((agentsData as { agents?: AIAgent[] }).agents ?? []);
      }
    } catch (e) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : "Failed to load data";
      setError(e instanceof Error && e.name === "AbortError" ? "Превышено время ожидания" : msg);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSeedDefaultRoles = useCallback(async () => {
    setSeedLoading(true);
    setError(null);
    try {
      const providerId = selection.agentId || settings.defaultAgentId;
      const modelName = selection.modelId || settings.defaultModelId;
      const body: Record<string, string> = {};
      if (providerId && modelName) {
        body.providerId = providerId;
        body.modelName = modelName;
      }
      const res = await fetch("/api/roles/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      let data: { ok?: boolean; message?: string; error?: string };
      try {
        data = JSON.parse(text) as { ok?: boolean; message?: string; error?: string };
      } catch {
        data = { error: text?.slice(0, 200) || "Ответ сервера не в формате JSON" };
      }
      if (res.ok && data.ok) {
        await loadData();
      } else {
        const msg = data.message ?? data.error ?? "Не удалось создать роли";
        setError(
          res.status === 409
            ? `${msg} Используйте «Восстановить роли по умолчанию» для замены.`
            : msg
        );
      }
    } catch (e) {
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "Превышено время ожидания (30 сек). Проверьте подключение к Appwrite."
          : e instanceof Error
            ? e.message
            : "Ошибка при создании ролей";
      setError(msg);
    } finally {
      setSeedLoading(false);
    }
  }, [loadData, selection.agentId, selection.modelId, settings.defaultAgentId, settings.defaultModelId]);

  const handleRestoreDefaultRoles = useCallback(async () => {
    if (!confirm("Все текущие роли будут удалены и заменены на 6 стандартных. Продолжить?")) return;
    setSeedLoading(true);
    setError(null);
    try {
      const providerId = selection.agentId || settings.defaultAgentId;
      const modelName = selection.modelId || settings.defaultModelId;
      const body: Record<string, string> = {};
      if (providerId && modelName) {
        body.providerId = providerId;
        body.modelName = modelName;
      }
      const res = await fetch("/api/roles/seed?force=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      let data: { ok?: boolean; message?: string; error?: string };
      try {
        data = JSON.parse(text) as { ok?: boolean; message?: string; error?: string };
      } catch {
        data = { error: text?.slice(0, 200) || "Ответ сервера не в формате JSON" };
      }
      if (res.ok && data.ok) {
        await loadData();
      } else {
        setError(data.message ?? data.error ?? "Не удалось восстановить роли");
      }
    } catch (e) {
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "Превышено время ожидания (30 сек). Проверьте подключение к Appwrite."
          : e instanceof Error
            ? e.message
            : "Ошибка при восстановлении ролей";
      setError(msg);
    } finally {
      setSeedLoading(false);
    }
  }, [loadData, selection.agentId, selection.modelId, settings.defaultAgentId, settings.defaultModelId]);

  const handleCreate = () => {
    setEditingRole(null);
    setFormPromptOverride(null);
    setFormOpen(true);
  };

  const handleEdit = (role: AgentRole) => {
    setEditingRole(role);
    setFormPromptOverride(null);
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
    if (historyRole) {
      const roleToEdit = historyRole;
      setHistoryRole(null);
      setEditingRole(roleToEdit);
      setFormPromptOverride(prompt);
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
    <SacredBackground pattern="flower" className="h-screen">
      <ParticleField count={8} />
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <GlowText as="h1" variant="gold" className="text-xl mb-1">
              {t("settings.title")}
            </GlowText>
            <p className="text-text-muted text-xs">
              LLM, проект и роли агентов
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/">
              <NeonButton variant="ghost" size="sm">
                ← {t("common.back")}
              </NeonButton>
            </Link>
            <NeonButton variant="ghost" size="sm" onClick={settings.resetSettings}>
              {t("common.reset_defaults")}
            </NeonButton>
            <Link to="/">
              <NeonButton variant="primary" size="sm">
                {t("common.done")}
              </NeonButton>
            </Link>
          </div>
        </div>

        {/* LLM & Pipeline */}
        <SettingsSection title={t("settings.section_llm")} className="mb-6 animate-fade-in-up">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-muted block mb-2">
                {t("settings.default_agent")}
              </label>
              <select
                value={selection.agentId}
                onChange={(e) => handleAgentChange(e.target.value)}
                className="w-full bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40 transition-colors"
              >
                {agents.length === 0 && <option value="">{t("settings.no_agents")}</option>}
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.status === "online" ? "\u2713" : "\u2717"} {agent.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-muted block mb-2">
                {t("settings.default_model")}
              </label>
              <select
                value={selection.modelId}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40 transition-colors"
              >
                {!selectedAgent?.models.length && <option value="">—</option>}
                {selectedAgent?.models.map((model) => {
                  const ctxLabel = model.contextLength
                    ? ` [${model.contextLength >= 1024 ? `${Math.round(model.contextLength / 1024)}K` : model.contextLength}]`
                    : "";
                  return (
                    <option key={model.id} value={model.id}>
                      {model.name}{ctxLabel}
                    </option>
                  );
                })}
              </select>
            </div>
            <NeonSlider
              label={`${t("settings.default_temperature")}: ${selection.temperature.toFixed(1)}`}
              min={0}
              max={2}
              step={0.1}
              value={selection.temperature}
              onChange={handleTemperatureChange}
            />
            <p className="text-[9px] text-text-muted">
              Используется для оркестрации цепочки и роутинга ролей
            </p>
          </div>
        </SettingsSection>

        {/* Project */}
        <SettingsSection title={t("settings.section_project")} className="mb-6 animate-fade-in-up">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-muted block mb-2">
                {t("settings.default_project_type")}
              </label>
              <select
                value={settings.defaultProjectType}
                onChange={(e) => settings.updateSettings({ defaultProjectType: e.target.value as "react" | "vue" | "html" })}
                className="w-full bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40 transition-colors"
              >
                <option value="react">React + TypeScript</option>
                <option value="vue">Vue 3</option>
                <option value="html">HTML / CSS / JS</option>
              </select>
            </div>
            <NeonInput
              label={t("settings.editor_font_size")}
              type="number"
              value={String(settings.editorFontSize)}
              onChange={(e) => settings.updateSettings({ editorFontSize: parseInt(e.target.value, 10) || 13 })}
            />
            <div>
              <label className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-muted block mb-2">
                {t("settings.language")}
              </label>
              <select
                value={settings.language}
                onChange={(e) => settings.updateSettings({ language: e.target.value as "ru" | "en" })}
                className="w-full bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40 transition-colors"
              >
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoSave}
                onChange={(e) => settings.updateSettings({ autoSave: e.target.checked })}
                className="accent-gold-pure"
              />
              <span className="text-xs text-text-secondary">{t("settings.auto_save")}</span>
            </label>
          </div>
        </SettingsSection>

        {/* Roles section header */}
        <div className="flex items-center justify-between mb-4">
          <GlowText as="h2" variant="gold" className="text-base">
            {t("settings.section_roles")}
          </GlowText>
          <div className="flex gap-2">
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={handleSeedDefaultRoles}
              disabled={seedLoading}
            >
              {seedLoading ? "..." : "Создать роли по умолчанию"}
            </NeonButton>
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={handleRestoreDefaultRoles}
              disabled={seedLoading}
            >
              {seedLoading ? "..." : "Восстановить роли по умолчанию"}
            </NeonButton>
            <NeonButton variant="primary" size="sm" onClick={handleCreate}>
              + {t("role.new_role")}
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

        {/* Role form (modal only for create) */}
        {formOpen && !editingRole && (
          <AgentRoleForm
            open={formOpen}
            onClose={() => {
              setFormOpen(false);
              setFormPromptOverride(null);
            }}
            onSave={handleSave}
            role={null}
            providers={providers}
            promptOverride={formPromptOverride}
            inline={false}
          />
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
            {roles.map((role, index) =>
              editingRole?.id === role.id ? (
                <div
                  key={role.id}
                  className="glass rounded-lg border border-gold-pure/30 overflow-hidden transition-all"
                >
                  <AgentRoleCard
                    role={role}
                    providerOnline={isProviderOnline(role.providerId)}
                    onEdit={() => handleEdit(role)}
                    onDelete={() => handleDelete(role)}
                    onTest={() => setTestingRole(role)}
                    onHistory={() => setHistoryRole(role)}
                    isDragging={dragIndex === index}
                    isDragOver={dragOverIndex === index}
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverIndex(index);
                    }}
                    onDrop={() => {
                      if (dragIndex !== null) handleDrop(dragIndex, index);
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    isExpanded
                  />
                  <AgentRoleForm
                    open
                    onClose={() => {
                      setEditingRole(null);
                      setFormPromptOverride(null);
                    }}
                    onSave={handleSave}
                    role={editingRole}
                    providers={providers}
                    promptOverride={formPromptOverride}
                    inline="embedded"
                  />
                </div>
              ) : (
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
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverIndex(index);
                  }}
                  onDrop={() => {
                    if (dragIndex !== null) handleDrop(dragIndex, index);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                />
              )
            )}
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
      </div>

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
