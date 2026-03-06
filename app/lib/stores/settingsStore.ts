import { create } from "zustand";
import { persist } from "zustand/middleware";

type AppSettings = {
  defaultTemperature: number;
  defaultProjectType: "react" | "vue" | "html";
  editorFontSize: number;
  language: "ru" | "en";
  autoSave: boolean;
  defaultAgentId: string;
  defaultModelId: string;
  perplexityApiKey: string;
};

type SettingsActions = {
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;
};

const DEFAULT_SETTINGS: AppSettings = {
  defaultTemperature: 0.3,
  defaultProjectType: "react",
  editorFontSize: 13,
  language: "ru",
  autoSave: true,
  defaultAgentId: "",
  defaultModelId: "",
  perplexityApiKey: "",
};

export const useSettingsStore = create<AppSettings & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      updateSettings: (partial) => set((state) => ({ ...state, ...partial })),
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "nit-by-settings",
    },
  ),
);
