import { create } from "zustand";
import type { AIAgent, AgentSelection } from "@shared/types/agent";
import { useSettingsStore } from "./settingsStore";
import { PERPLEXITY_AGENT } from "~/features/agents/constants";

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
    const settings = useSettingsStore.getState();

    const applySelection = (agentId: string, modelId: string) => {
      set({
        selection: {
          ...selection,
          agentId,
          modelId,
          temperature: settings.defaultTemperature,
        },
      });
    };

    if (selection.agentId && agents.some((a) => a.id === selection.agentId)) {
      const agent = agents.find((a) => a.id === selection.agentId);
      const modelExists = agent?.models.some((m) => m.id === selection.modelId);
      if (!modelExists && agent?.models[0]) {
        applySelection(selection.agentId, agent.models[0].id);
      }
      return;
    }

    if (settings.defaultAgentId === "perplexity" && settings.perplexityApiKey.trim()) {
      const modelId =
        PERPLEXITY_AGENT.models.some((m) => m.id === settings.defaultModelId)
          ? settings.defaultModelId
          : PERPLEXITY_AGENT.models[0]?.id ?? "";
      applySelection("perplexity", modelId);
      return;
    }

    if (settings.defaultAgentId && agents.some((a) => a.id === settings.defaultAgentId)) {
      const agent = agents.find((a) => a.id === settings.defaultAgentId)!;
      const modelId =
        agent.models.some((m) => m.id === settings.defaultModelId)
          ? settings.defaultModelId
          : agent.models[0]?.id ?? "";
      applySelection(settings.defaultAgentId, modelId);
      return;
    }

    if (agents.length > 0) {
      const onlineAgent = agents.find((a) => a.status === "online");
      if (onlineAgent && onlineAgent.models.length > 0) {
        applySelection(onlineAgent.id, onlineAgent.models[0]?.id ?? "");
      }
    }
  },

  setSelection: (partial) =>
    set((state) => ({ selection: { ...state.selection, ...partial } })),

  setDiscovering: (isDiscovering) => set({ isDiscovering }),

  setError: (error) => set({ error }),

  getSelectedAgent: () => {
    const { agents, selection } = get();
    if (selection.agentId === "perplexity") {
      const hasKey = useSettingsStore.getState().perplexityApiKey.trim().length > 0;
      return hasKey ? PERPLEXITY_AGENT : undefined;
    }
    return agents.find((a) => a.id === selection.agentId);
  },
}));
