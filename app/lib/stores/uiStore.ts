import { create } from "zustand";

type PanelLayout = "chat" | "editor" | "preview" | "split";

type UIState = {
  sidebarOpen: boolean;
  activePanel: PanelLayout;
  settingsOpen: boolean;
};

type UIActions = {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActivePanel: (panel: PanelLayout) => void;
  toggleSettings: () => void;
};

export const useUIStore = create<UIState & UIActions>((set) => ({
  sidebarOpen: true,
  activePanel: "chat",
  settingsOpen: false,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setActivePanel: (activePanel) => set({ activePanel }),
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
}));
