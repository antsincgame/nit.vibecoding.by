import { useState } from "react";
import { cn } from "~/lib/utils/cn";
import { NeonButton } from "~/components/ui/NeonButton";
import { NeonInput } from "~/components/ui/NeonInput";
import { NeonModal } from "~/components/ui/NeonModal";
import { useProjectStore } from "~/lib/stores/projectStore";
import type { Project, CreateProjectInput } from "@shared/types/project";

interface ProjectListProps {
  projects: Project[];
  isLoading: boolean;
  onCreate: (input: CreateProjectInput) => Promise<Project | null>;
  onDelete: (id: string) => Promise<void>;
}

export function ProjectList({ projects, isLoading, onCreate, onDelete }: ProjectListProps) {
  const { currentProject, setCurrentProject } = useProjectStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");

  const filtered = search
    ? projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onCreate({ name: newName.trim(), description: "", type: "react" });
    setNewName("");
    setShowCreateModal(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border-subtle space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-[10px] uppercase tracking-[0.2em] text-text-secondary">
            Projects
          </h2>
          <span className="text-[9px] text-text-muted">{projects.length}</span>
        </div>
        <NeonButton variant="primary" size="sm" className="w-full" onClick={() => setShowCreateModal(true)}>
          + New
        </NeonButton>
        {projects.length > 3 && (
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-deep-space/80 border border-border-subtle rounded px-2 py-1 text-[10px] text-text-primary placeholder:text-text-muted outline-none focus:border-gold-pure/30"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <p className="text-text-muted text-[10px] text-center py-4 animate-pulse">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-text-muted text-[10px] text-center py-8">
            {search ? "No matches" : "No projects yet"}
          </p>
        ) : (
          filtered.map((project) => (
            <button
              key={project.id}
              onClick={() => setCurrentProject(project)}
              className={cn(
                "w-full text-left px-3 py-2 text-[11px] transition-colors border-l-2",
                "hover:bg-surface",
                currentProject?.id === project.id
                  ? "bg-gold-pure/10 text-gold-pure border-l-gold-pure"
                  : "text-text-secondary border-l-transparent",
              )}
            >
              <div className="font-heading truncate">{project.name}</div>
              <div className="text-[9px] text-text-muted mt-0.5">{project.type}</div>
            </button>
          ))
        )}
      </div>

      <NeonModal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="New Project">
        <div className="space-y-4">
          <NeonInput
            label="Project Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="My Awesome App"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <NeonButton variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
              Cancel
            </NeonButton>
            <NeonButton variant="primary" size="sm" onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </NeonButton>
          </div>
        </div>
      </NeonModal>
    </div>
  );
}
