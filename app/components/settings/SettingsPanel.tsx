import { NeonModal } from "~/components/ui/NeonModal";
import { NeonInput } from "~/components/ui/NeonInput";
import { NeonButton } from "~/components/ui/NeonButton";
import { useSettingsStore } from "~/lib/stores/settingsStore";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const settings = useSettingsStore();

  return (
    <NeonModal open={open} onClose={onClose} title="Settings">
      <div className="space-y-5">
        {/* Temperature */}
        <div>
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary mb-1 block">
            Default Temperature: {settings.defaultTemperature.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.defaultTemperature}
            onChange={(e) => settings.updateSettings({ defaultTemperature: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>

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
