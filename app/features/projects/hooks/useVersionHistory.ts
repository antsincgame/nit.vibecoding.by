import { useCallback } from "react";
import { useProjectStore } from "~/lib/stores/projectStore";
import { useChatStore } from "~/lib/stores/chatStore";
import * as versionApi from "../api/versionApi";

export function useVersionHistory() {
  const {
    currentProject,
    versions,
    setVersions,
    addVersion,
    setCurrentVersion,
    setError,
  } = useProjectStore();
  const { setGeneratedCode } = useChatStore();

  const loadVersions = useCallback(async () => {
    if (!currentProject) return [];
    try {
      const data = await versionApi.listVersions(currentProject.id);
      setVersions(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions");
      return [];
    }
  }, [currentProject, setVersions, setError]);

  const saveVersion = useCallback(
    async (data: {
      code: Record<string, string>;
      prompt: string;
      model: string;
      agentId: string;
      temperature: number;
    }) => {
      if (!currentProject) return null;
      try {
        const version = await versionApi.createVersion({
          projectId: currentProject.id,
          ...data,
        });
        addVersion(version);
        return version;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save version");
        return null;
      }
    },
    [currentProject, addVersion, setError],
  );

  const restoreVersion = useCallback(
    (versionId: string) => {
      const version = versions.find((v) => v.id === versionId);
      if (!version) return;
      setCurrentVersion(version);
      setGeneratedCode(version.code);
    },
    [versions, setCurrentVersion, setGeneratedCode],
  );

  return { versions, loadVersions, saveVersion, restoreVersion };
}
