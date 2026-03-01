import { create } from "zustand";
import type { Project, ProjectVersion } from "@shared/types/project";

type ProjectState = {
  projects: Project[];
  currentProject: Project | null;
  versions: ProjectVersion[];
  currentVersion: ProjectVersion | null;
  isLoading: boolean;
  error: string | null;
};

type ProjectActions = {
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  setVersions: (versions: ProjectVersion[]) => void;
  setCurrentVersion: (version: ProjectVersion | null) => void;
  addVersion: (version: ProjectVersion) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
};

export const useProjectStore = create<ProjectState & ProjectActions>((set) => ({
  projects: [],
  currentProject: null,
  versions: [],
  currentVersion: null,
  isLoading: false,
  error: null,

  setProjects: (projects) => set({ projects }),

  setCurrentProject: (currentProject) =>
    set({ currentProject, versions: [], currentVersion: null }),

  addProject: (project) =>
    set((state) => ({ projects: [project, ...state.projects] })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    })),

  setVersions: (versions) => set({ versions }),

  setCurrentVersion: (currentVersion) => set({ currentVersion }),

  addVersion: (version) =>
    set((state) => ({ versions: [version, ...state.versions] })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}));
