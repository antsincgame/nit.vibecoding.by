import { create } from "zustand";

type PanelLayout = "chat" | "editor" | "preview" | "split";

type UIState = {
  sidebarOpen: boolean;
  activePanel: PanelLayout;
};

type UIActions = {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActivePanel: (panel: PanelLayout) => void;
};

export const useUIStore = create<UIState & UIActions>((set) => ({
  sidebarOpen: true,
  activePanel: "chat",

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setActivePanel: (activePanel) => set({ activePanel }),
}));
