import { useMemo, useEffect } from "react";
import { NeonModal } from "~/components/ui/NeonModal";
import { NeonInput } from "~/components/ui/NeonInput";
import { NeonButton } from "~/components/ui/NeonButton";
import { useSettingsStore } from "~/lib/stores/settingsStore";
import { useAgentStore } from "~/lib/stores/agentStore";
import { PERPLEXITY_AGENT } from "~/features/agents/constants";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const settings = useSettingsStore();
  const { agents, selection, setSelection } = useAgentStore();

  const mergedAgents = useMemo(() => {
    if (!settings.perplexityApiKey.trim()) return agents;
    return [...agents, PERPLEXITY_AGENT];
  }, [agents, settings.perplexityApiKey]);

  const selectedAgent = mergedAgents.find((a) => a.id === selection.agentId);

  const handleAgentChange = (agentId: string) => {
    const agent = mergedAgents.find((a) => a.id === agentId);
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

  return (
    <NeonModal open={open} onClose={onClose} title="Settings">
      <div className="space-y-5">
        {/* Agent & Model */}
        <div className="space-y-3">
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary block">
            Default Agent
          </label>
          <select
            value={selection.agentId}
            onChange={(e) => handleAgentChange(e.target.value)}
            className="w-full bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40"
          >
            {mergedAgents.length === 0 && <option value="">No agents</option>}
            {mergedAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.status === "online" ? "\u2713" : "\u2717"} {agent.name}
              </option>
            ))}
          </select>

          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary block">
            Default Model
          </label>
          <select
            value={selection.modelId}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40"
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

        {/* Temperature */}
        <div>
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary mb-1 block">
            Default Temperature: {selection.temperature.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={selection.temperature}
            onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Perplexity API Key */}
        <NeonInput
          label="Perplexity API Key"
          type="password"
          value={settings.perplexityApiKey}
          onChange={(e) => settings.updateSettings({ perplexityApiKey: e.target.value })}
          placeholder="pplx-xxxxxxxxxxxx"
        />

        {/* Project Type */}
        <div>
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary mb-1 block">
            Default Project Type
          </label>
          <select
            value={settings.defaultProjectType}
            onChange={(e) => settings.updateSettings({ defaultProjectType: e.target.value as "react" | "vue" | "html" })}
            className="w-full bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40"
          >
            <option value="react">React + TypeScript</option>
            <option value="vue">Vue 3</option>
            <option value="html">HTML / CSS / JS</option>
          </select>
        </div>

        {/* Font Size */}
        <NeonInput
          label="Editor Font Size"
          type="number"
          value={settings.editorFontSize}
          onChange={(e) => settings.updateSettings({ editorFontSize: parseInt(e.target.value, 10) })}
        />

        {/* Language */}
        <div>
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary mb-1 block">
            Language
          </label>
          <select
            value={settings.language}
            onChange={(e) => settings.updateSettings({ language: e.target.value as "ru" | "en" })}
            className="w-full bg-deep-space border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-pure/40"
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>

        {/* Auto-save */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoSave}
            onChange={(e) => settings.updateSettings({ autoSave: e.target.checked })}
            className="accent-gold-pure"
          />
          <span className="text-xs text-text-secondary">Auto-save versions</span>
        </label>

        <div className="flex justify-between pt-2">
          <NeonButton variant="ghost" size="sm" onClick={settings.resetSettings}>
            Reset Defaults
          </NeonButton>
          <NeonButton variant="primary" size="sm" onClick={onClose}>
            Done
          </NeonButton>
        </div>
      </div>
    </NeonModal>
  );
}
