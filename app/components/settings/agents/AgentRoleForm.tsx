import { useState, useEffect } from "react";
import type { AgentRole } from "@shared/types/agentRole";
import type { AIAgent } from "@shared/types/agent";
import { NeonModal } from "~/components/ui/NeonModal";
import { NeonButton } from "~/components/ui/NeonButton";
import { NeonInput } from "~/components/ui/NeonInput";
import { cn } from "~/lib/utils/cn";

interface AgentRoleFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<AgentRole>) => Promise<void>;
  role?: AgentRole | null; // null = create mode
  providers: AIAgent[];
  promptOverride?: string | null;
  inline?: boolean;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  systemPrompt: "",
  providerId: "ollama",
  modelName: "",
  order: 10,
  isActive: true,
  timeoutMs: 60000,
  maxRetries: 2,
  outputFormat: "freetext" as AgentRole["outputFormat"],
  includeNitPrompt: false,
  temperature: 0.7,
};

export function AgentRoleForm({ open, onClose, onSave, role, providers, promptOverride, inline = false }: AgentRoleFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");

  const isEdit = !!role;

  useEffect(() => {
    if (role) {
      setForm({
        name: role.name,
        description: role.description,
        systemPrompt: promptOverride ?? role.systemPrompt,
        providerId: role.providerId,
        modelName: role.modelName,
        order: role.order,
        isActive: role.isActive,
        timeoutMs: role.timeoutMs,
        maxRetries: role.maxRetries,
        outputFormat: role.outputFormat,
        includeNitPrompt: role.includeNitPrompt,
        temperature: role.temperature,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError(null);
    setConnectionStatus("idle");
  }, [role, open, promptOverride]);

  const selectedProvider = providers.find((p) => p.id === form.providerId);
  const availableModels = selectedProvider?.models ?? [];

  const handleCheckConnection = async () => {
    setConnectionStatus("checking");
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      const agents: AIAgent[] = data.agents ?? [];
      const provider = agents.find((a) => a.id === form.providerId);

      if (!provider || provider.status !== "online") {
        setConnectionStatus("error");
        return;
      }

      const modelExists = provider.models.some((m) => m.id === form.modelName || m.name === form.modelName);
      setConnectionStatus(modelExists ? "ok" : "error");
    } catch {
      setConnectionStatus("error");
    }
  };

  const validate = (): string | null => {
    if (form.name.length < 2 || form.name.length > 50) return "Имя: 2-50 символов";
    if (form.description.length < 10 || form.description.length > 500) return "Описание: 10-500 символов";
    if (form.systemPrompt.length < 50) return "Промпт: минимум 50 символов";
    if (!form.modelName.trim()) return "Укажите модель";
    if (form.timeoutMs < 5000 || form.timeoutMs > 300000) return "Таймаут: 5-300 секунд";
    if (form.maxRetries < 0 || form.maxRetries > 5) return "Ретраи: 0-5";
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const formContent = (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Name */}
        <NeonInput
          label="Имя роли"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="SEO-специалист"
          disabled={role?.isLocked}
        />

        {/* Description */}
        <NeonInput
          label="Описание"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Проверяет meta-теги и предлагает ключевые слова"
        />

        {/* Provider */}
        <div>
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary mb-1 block">
            Провайдер
          </label>
          <select
            value={form.providerId}
            onChange={(e) => {
              setForm((f) => ({ ...f, providerId: e.target.value, modelName: "" }));
              setConnectionStatus("idle");
            }}
            className="w-full bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.status === "online" ? "✓" : "✗"} {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Model + Check */}
        <div>
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary mb-1 block">
            Модель
          </label>
          <div className="flex gap-2">
            {availableModels.length > 0 ? (
              <select
                value={form.modelName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, modelName: e.target.value }));
                  setConnectionStatus("idle");
                }}
                className="flex-1 bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40"
              >
                <option value="">— выберите —</option>
                {/* Show saved model if it's not in discovered list */}
                {form.modelName && !availableModels.some((m) => m.id === form.modelName) && (
                  <option value={form.modelName}>{form.modelName} (сохранённая)</option>
                )}
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            ) : (
              <input
                value={form.modelName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, modelName: e.target.value }));
                  setConnectionStatus("idle");
                }}
                placeholder="mistral"
                className="flex-1 bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40 placeholder:text-text-muted/50"
              />
            )}
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={handleCheckConnection}
              disabled={connectionStatus === "checking" || !form.modelName}
            >
              {connectionStatus === "checking" && "⏳"}
              {connectionStatus === "ok" && "✅"}
              {connectionStatus === "error" && "❌"}
              {connectionStatus === "idle" && "Проверить"}
            </NeonButton>
          </div>
        </div>

        {/* Temperature */}
        <div>
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary mb-1 block">
            Температура: {form.temperature.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={form.temperature}
            onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
            className="w-full"
          />
        </div>

        {/* Timeout + Retries row */}
        <div className="flex gap-3">
          <div className="flex-1">
            <NeonInput
              label="Таймаут (сек)"
              type="number"
              value={form.timeoutMs / 1000}
              onChange={(e) => setForm((f) => ({ ...f, timeoutMs: parseInt(e.target.value) * 1000 || 60000 }))}
            />
          </div>
          <div className="flex-1">
            <NeonInput
              label="Макс. ретраев"
              type="number"
              value={form.maxRetries}
              onChange={(e) => setForm((f) => ({ ...f, maxRetries: parseInt(e.target.value) || 0 }))}
            />
          </div>
        </div>

        {/* Output Format */}
        <div>
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary mb-1 block">
            Формат вывода
          </label>
          <select
            value={form.outputFormat}
            onChange={(e) => setForm((f) => ({ ...f, outputFormat: e.target.value as "freetext" | "json" }))}
            className="w-full bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40"
          >
            <option value="freetext">Свободный текст</option>
            <option value="json">JSON</option>
          </select>
        </div>

        {/* Order */}
        <NeonInput
          label="Порядок"
          type="number"
          value={form.order}
          onChange={(e) => setForm((f) => ({ ...f, order: parseFloat(e.target.value) || 1 }))}
          disabled={role?.isLocked}
        />

        {/* Active toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            className="accent-gold-pure"
          />
          <span className="text-xs text-text-secondary">Активна</span>
        </label>

        {/* Include NIT prompt toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.includeNitPrompt}
            onChange={(e) => setForm((f) => ({ ...f, includeNitPrompt: e.target.checked }))}
            className="accent-gold-pure"
          />
          <div>
            <span className="text-xs text-text-secondary">Генерация кода (NIT-промпт)</span>
            <p className="text-[10px] text-text-muted mt-0.5">
              Включите для ролей, которые генерируют код. Добавляет инструкции по формату nitArtifact.
            </p>
          </div>
        </label>

        {/* System Prompt */}
        <div>
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary mb-1 block">
            Генеральный промпт
          </label>
          <textarea
            value={form.systemPrompt}
            onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
            rows={10}
            placeholder="Ты опытный SEO-специалист..."
            className={cn(
              "w-full bg-deep-space border border-border-subtle rounded px-3 py-2",
              "text-sm text-text-primary font-mono leading-relaxed",
              "outline-none focus:border-gold-pure/40 resize-y",
              "placeholder:text-text-muted/50",
            )}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-text-muted">
              {form.systemPrompt.length} символов (мин. 50)
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="glass rounded px-3 py-2 border border-red-400/20">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <NeonButton variant="ghost" size="sm" onClick={onClose}>
            Отмена
          </NeonButton>
          <NeonButton variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </NeonButton>
        </div>
      </div>
  );

  if (!open) return null;
  if (inline) {
    return (
      <div className="glass rounded-lg p-4 border border-border-subtle mb-6">
        <h3 className="text-sm font-heading uppercase tracking-[0.2em] text-gold-pure mb-4">
          {isEdit ? `Редактирование: ${role?.name}` : "Новая роль"}
        </h3>
        {formContent}
      </div>
    );
  }
  return (
    <NeonModal open={open} onClose={onClose} title={isEdit ? `Редактирование: ${role?.name}` : "Новая роль"}>
      {formContent}
    </NeonModal>
  );
}
