import { useCallback, useEffect } from "react";
import { useProjectStore } from "~/lib/stores/projectStore";
import * as projectApi from "../api/projectApi";
import type { CreateProjectInput } from "@shared/types/project";

export function useProjects() {
  const {
    projects,
    isLoading,
    error,
    setProjects,
    addProject,
    removeProject,
    setCurrentProject,
    setLoading,
    setError,
  } = useProjectStore();

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectApi.listProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [setProjects, setLoading, setError]);

  const create = useCallback(
    async (input: CreateProjectInput) => {
      setError(null);
      try {
        const project = await projectApi.createProject(input);
        addProject(project);
        setCurrentProject(project);
        return project;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create project");
        return null;
      }
    },
    [addProject, setCurrentProject, setError],
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await projectApi.deleteProject(id);
        removeProject(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete project");
      }
    },
    [removeProject, setError],
  );

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return { projects, isLoading, error, create, remove, reload: loadProjects };
}
