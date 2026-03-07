import { useState } from "react";
import { cn } from "~/lib/utils/cn";
import { NeonButton } from "~/components/ui/NeonButton";
import { NeonInput } from "~/components/ui/NeonInput";
import { NeonModal } from "~/components/ui/NeonModal";
import { useProjectStore } from "~/lib/stores/projectStore";
import { useT } from "~/lib/utils/i18n";
import type { Project, CreateProjectInput } from "@shared/types/project";

interface ProjectListProps {
  projects: Project[];
  isLoading: boolean;
  onCreate: (input: CreateProjectInput) => Promise<Project | null>;
  onDelete: (id: string) => Promise<void>;
}

export function ProjectList({ projects, isLoading, onCreate, onDelete }: ProjectListProps) {
  const t = useT();
  const { currentProject, setCurrentProject } = useProjectStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteTarget.id);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

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
            {t("sidebar.projects")}
          </h2>
          <span className="text-[9px] text-text-muted">{projects.length}</span>
        </div>
        <NeonButton variant="primary" size="sm" className="w-full" onClick={() => setShowCreateModal(true)}>
          {t("sidebar.new_project")}
        </NeonButton>
        {projects.length > 3 && (
          <input
            type="text"
            placeholder={t("project.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-deep-space/80 border border-border-subtle rounded px-2 py-1 text-[10px] text-text-primary placeholder:text-text-muted outline-none focus:border-gold-pure/30"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <p className="text-text-muted text-[10px] text-center py-4 animate-pulse">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="text-text-muted text-[10px] text-center py-8">
            {search ? t("project.no_matches") : t("project.no_projects")}
          </p>
        ) : (
          filtered.map((project) => (
            <div
              key={project.id}
              className={cn(
                "group relative w-full text-left px-3 py-2 text-[11px] transition-colors border-l-2",
                "hover:bg-surface",
                currentProject?.id === project.id
                  ? "bg-gold-pure/10 text-gold-pure border-l-gold-pure"
                  : "text-text-secondary border-l-transparent",
              )}
            >
              <button
                onClick={() => setCurrentProject(project)}
                className="w-full text-left"
              >
                <div className="font-heading truncate pr-6">{project.name}</div>
                <div className="text-[9px] text-text-muted mt-0.5">{project.type}</div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(project);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 text-[10px] transition-opacity p-1"
                title={t("common.delete")}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <NeonModal open={showCreateModal} onClose={() => setShowCreateModal(false)} title={t("project.new_project")}>
        <div className="space-y-4">
          <NeonInput
            label={t("project.name_label")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("project.name_placeholder")}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <NeonButton variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
              {t("common.cancel")}
            </NeonButton>
            <NeonButton variant="primary" size="sm" onClick={handleCreate} disabled={!newName.trim()}>
              {t("common.create")}
            </NeonButton>
          </div>
        </div>
      </NeonModal>

      <NeonModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t("project.delete_title")}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {t("project.delete_confirm")} <strong className="text-text-primary">{deleteTarget?.name}</strong>?
          </p>
          <div className="flex justify-end gap-2">
            <NeonButton variant="ghost" size="sm" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              {t("common.cancel")}
            </NeonButton>
            <NeonButton variant="danger" size="sm" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? t("common.deleting") : t("common.delete")}
            </NeonButton>
          </div>
        </div>
      </NeonModal>
    </div>
  );
}
