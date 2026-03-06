import { useEffect, useMemo, useRef } from "react";
import { Header } from "~/components/header/Header";
import { SacredBackground } from "~/components/ui/SacredBackground";
import { ParticleField } from "~/components/ui/ParticleField";
import { ChatPanel } from "~/components/chat/ChatPanel";
import { Workbench } from "~/components/editor/Workbench";
import { ProjectList } from "~/components/sidebar/ProjectList";
import { VersionHistory } from "~/components/sidebar/VersionHistory";
import { SettingsPanel } from "~/components/settings/SettingsPanel";
import { useAgentDiscovery } from "~/features/agents/hooks/useAgentDiscovery";
import { useProjects } from "~/features/projects/hooks/useProjects";
import { useVersionHistory } from "~/features/projects/hooks/useVersionHistory";
import { useKeyboardShortcuts } from "~/lib/hooks/useKeyboardShortcuts";
import { useAgentStore } from "~/lib/stores/agentStore";
import { useProjectStore } from "~/lib/stores/projectStore";
import { useSettingsStore } from "~/lib/stores/settingsStore";
import { useUIStore } from "~/lib/stores/uiStore";
import { useChatStore } from "~/lib/stores/chatStore";
import { useRoleStore } from "~/lib/stores/roleStore";
import { cn } from "~/lib/utils/cn";
import { sanitizeVersionCode } from "~/lib/utils/codeParser";


function AgentStatusBar() {
  const { agents, isDiscovering } = useAgentStore();
  const onlineCount = agents.filter((a) => a.status === "online").length;

  return (
    <div className="flex-shrink-0 p-3 border-t border-border-subtle">
      <h3 className="font-heading text-[9px] uppercase tracking-[0.2em] text-text-muted mb-2">
        Agents
      </h3>
      {isDiscovering ? (
        <p className="text-text-muted text-[10px] animate-pulse">Scanning...</p>
      ) : (
        <div className="space-y-1">
          {agents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 text-[11px]">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                  agent.status === "online" ? "bg-neon-emerald status-online" : "bg-red-400 status-offline",
                )}
              />
              <span className={cn("truncate", agent.status === "online" ? "text-text-primary" : "text-text-muted")}>
                {agent.name}
              </span>
              <span className="text-text-muted ml-auto text-[10px] flex-shrink-0">{agent.models.length}</span>
            </div>
          ))}
          {agents.length === 0 && <p className="text-text-muted text-[10px]">No agents</p>}
        </div>
      )}
      <p className="text-[9px] text-text-muted mt-2">{onlineCount} online</p>
    </div>
  );
}

function Sidebar() {
  const { currentProject } = useProjectStore();
  const { projects, isLoading, create, remove } = useProjects();
  const { versions, loadVersions, restoreVersion } = useVersionHistory();
  const prevProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    const projectId = currentProject?.id ?? null;
    const prevId = prevProjectIdRef.current;
    const isSwitch = prevId !== null && prevId !== projectId;
    prevProjectIdRef.current = projectId;

    if (!currentProject) return;

    if (isSwitch && prevId) {
      useChatStore.getState().saveProjectChat(prevId);
      // Reset pipeline session — prevents session leak across projects
      useRoleStore.getState().resetPipeline();
      useRoleStore.getState().setPipelineSessionId(null);
    }

    const loadChat = async () => {
      await useChatStore.getState().loadProjectChat(currentProject.id);

      const loaded = await loadVersions();
      const latest = loaded[0];
      if (!latest) return;

      const { generatedCode } = useChatStore.getState();
      if (Object.keys(generatedCode).length === 0) {
        const clean = sanitizeVersionCode(latest.code);
        if (Object.keys(clean).length > 0) {
          useChatStore.getState().setGeneratedCode(clean);
        }
      }
      useProjectStore.getState().setCurrentVersion(latest);
    };

    loadChat();
  }, [currentProject?.id]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const projectId = prevProjectIdRef.current;
      if (projectId) {
        useChatStore.getState().saveProjectChat(projectId);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ProjectList projects={projects} isLoading={isLoading} onCreate={create} onDelete={remove} />
      </div>
      {currentProject && versions.length > 0 && (
        <div className="flex-shrink-0 border-t border-border-subtle max-h-[200px] overflow-y-auto">
          <div className="px-3 pt-2">
            <h3 className="font-heading text-[9px] uppercase tracking-[0.2em] text-text-muted">History</h3>
          </div>
          <VersionHistory versions={versions} onRestore={restoreVersion} />
        </div>
      )}
      <AgentStatusBar />
    </div>
  );
}

export default function Home() {
  useAgentDiscovery();

  const language = useSettingsStore((s) => s.language);
  const { sidebarOpen, settingsOpen, toggleSidebar, toggleSettings } = useUIStore();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const shortcuts = useMemo(
    () => ({
      "mod+b": toggleSidebar,
      "mod+,": toggleSettings,
    }),
    [toggleSidebar, toggleSettings],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <SacredBackground pattern="flower" className="h-screen overflow-hidden">
      <ParticleField count={10} />
      <Header />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {sidebarOpen && (
          <aside className="w-56 flex-shrink-0 border-r border-border-subtle bg-deep-space/40 backdrop-blur-sm overflow-hidden">
            <Sidebar />
          </aside>
        )}

        <main className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          <div className="w-[340px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-border-subtle">
            <ChatPanel />
          </div>

          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
            <Workbench />
          </div>
        </main>
      </div>

      <SettingsPanel open={settingsOpen} onClose={toggleSettings} />
    </SacredBackground>
  );
}
