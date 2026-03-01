import { create } from "zustand";
import type { AIAgent, AgentSelection } from "@shared/types/agent";
import { useSettingsStore } from "./settingsStore";

type AgentState = {
  agents: AIAgent[];
  selection: AgentSelection;
  isDiscovering: boolean;
  error: string | null;
};

type AgentActions = {
  setAgents: (agents: AIAgent[]) => void;
  setSelection: (selection: Partial<AgentSelection>) => void;
  setDiscovering: (discovering: boolean) => void;
  setError: (error: string | null) => void;
  getSelectedAgent: () => AIAgent | undefined;
};

export const useAgentStore = create<AgentState & AgentActions>((set, get) => ({
  agents: [],
  selection: {
    agentId: "",
    modelId: "",
    temperature: useSettingsStore.getState().defaultTemperature,
  },
  isDiscovering: false,
  error: null,

  setAgents: (agents) => {
    set({ agents });

    const { selection } = get();
    if (!selection.agentId && agents.length > 0) {
      const onlineAgent = agents.find((a) => a.status === "online");
      if (onlineAgent && onlineAgent.models.length > 0) {
        set({
          selection: {
            ...selection,
            agentId: onlineAgent.id,
            modelId: onlineAgent.models[0]?.id ?? "",
          },
        });
      }
    }
  },

  setSelection: (partial) =>
    set((state) => ({ selection: { ...state.selection, ...partial } })),

  setDiscovering: (isDiscovering) => set({ isDiscovering }),

  setError: (error) => set({ error }),

  getSelectedAgent: () => {
    const { agents, selection } = get();
    return agents.find((a) => a.id === selection.agentId);
  },
}));
