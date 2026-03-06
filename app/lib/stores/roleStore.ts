import { create } from "zustand";
import type { AgentRole, RoleSelection, PipelineEvent } from "@shared/types/agentRole";
import { AUTO_ROLE_ID } from "@shared/types/agentRole";

type PipelineStatus = "idle" | "selecting" | "running" | "chain_running" | "error";

type ChainStep = {
  roleName: string;
  status: "pending" | "running" | "done" | "error";
  durationMs?: number;
};

type RoleState = {
  roles: AgentRole[];
  selection: RoleSelection;
  pipelineSessionId: string | null;
  pipelineStatus: PipelineStatus;
  isChainMode: boolean;
  chainSteps: ChainStep[];
  chainCurrent: number;
  chainTotal: number;
  currentRoleName: string | null;
  currentModel: string | null;
  currentProvider: string | null;
  stepStartTime: number | null;
  isLoading: boolean;
  error: string | null;
};

type RoleActions = {
  loadRoles: () => Promise<void>;
  setRoleSelection: (roleId: string) => void;
  setLocalContext: (text: string) => void;
  clearLocalContext: () => void;
  setPipelineSessionId: (id: string | null) => void;
  setChainMode: (isChain: boolean) => void;
  // Pipeline event handlers
  handlePipelineEvent: (event: PipelineEvent) => void;
  resetPipeline: () => void;
};

export const useRoleStore = create<RoleState & RoleActions>((set, get) => ({
  roles: [],
  selection: { roleId: AUTO_ROLE_ID, localContext: "" },
  pipelineSessionId: null,
  pipelineStatus: "idle",
  isChainMode: false,
  chainSteps: [],
  chainCurrent: 0,
  chainTotal: 0,
  currentRoleName: null,
  currentModel: null,
  currentProvider: null,
  stepStartTime: null,
  isLoading: false,
  error: null,

  loadRoles: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/roles?active=true");
      if (!res.ok) throw new Error("Failed to load roles");
      const json = await res.json();
      set({ roles: json.roles ?? [], isLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load roles";
      set({ error: msg, isLoading: false });
    }
  },

  setRoleSelection: (roleId) =>
    set((s) => ({ selection: { ...s.selection, roleId } })),

  setLocalContext: (text) =>
    set((s) => ({ selection: { ...s.selection, localContext: text } })),

  clearLocalContext: () =>
    set((s) => ({ selection: { ...s.selection, localContext: "" } })),

  setPipelineSessionId: (id) => set({ pipelineSessionId: id }),

  setChainMode: (isChain) => set({ isChainMode: isChain }),

  handlePipelineEvent: (event) => {
    switch (event.type) {
      case "session_init":
        // Handled by usePipelineStreaming directly
        break;

      case "role_selected":
        set((state) => {
          const newState: Partial<RoleState> = {
            pipelineStatus: "selecting",
            currentRoleName: event.roleName,
          };
          // In chain mode, dynamically build chain steps from server events
          if (state.chainTotal > 0 || state.chainSteps.length > 0) {
            const existing = state.chainSteps.find((s) => s.roleName === event.roleName);
            if (!existing) {
              newState.chainSteps = [
                ...state.chainSteps,
                { roleName: event.roleName, status: "pending" as const },
              ];
            }
          }
          return newState;
        });
        break;

      case "step_start":
        set({
          pipelineStatus: get().isChainMode ? "chain_running" : "running",
          currentRoleName: event.roleName,
          currentModel: event.model,
          currentProvider: event.provider,
          stepStartTime: Date.now(),
          chainSteps: get().chainSteps.map((s) =>
            s.roleName === event.roleName ? { ...s, status: "running" as const } : s,
          ),
        });
        break;

      case "step_complete":
        set({
          chainSteps: get().chainSteps.map((s) =>
            s.roleName === event.roleName
              ? { ...s, status: "done" as const, durationMs: event.durationMs }
              : s,
          ),
          stepStartTime: null,
        });
        break;

      case "chain_progress":
        set({ chainCurrent: event.current, chainTotal: event.total });
        break;

      case "error":
        set({
          pipelineStatus: "error",
          error: event.message,
          stepStartTime: null,
          // Mark the specific role as error, and any still-running as error too
          chainSteps: get().chainSteps.map((s) => {
            if (s.roleName === event.roleName) return { ...s, status: "error" as const };
            if (s.status === "running") return { ...s, status: "error" as const };
            return s;
          }),
        });
        break;

      case "done":
        set({ pipelineStatus: "idle", stepStartTime: null });
        break;
    }
  },

  resetPipeline: () =>
    set({
      pipelineStatus: "idle",
      isChainMode: false,
      chainSteps: [],
      chainCurrent: 0,
      chainTotal: 0,
      currentRoleName: null,
      currentModel: null,
      currentProvider: null,
      stepStartTime: null,
      error: null,
    }),
}));
