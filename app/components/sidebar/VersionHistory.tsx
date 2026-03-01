import { format } from "date-fns";
import { cn } from "~/lib/utils/cn";
import type { ProjectVersion } from "@shared/types/project";
import { useProjectStore } from "~/lib/stores/projectStore";

interface VersionHistoryProps {
  versions: ProjectVersion[];
  onRestore: (versionId: string) => void;
}

export function VersionHistory({ versions, onRestore }: VersionHistoryProps) {
  const { currentVersion } = useProjectStore();

  if (versions.length === 0) {
    return (
      <div className="p-3 text-text-muted text-[10px] text-center">
        No versions yet
      </div>
    );
  }

  return (
    <div className="py-1">
      {versions.map((version) => {
        const isActive = currentVersion?.id === version.id;
        const fileCount = Object.keys(version.code).length;

        return (
          <button
            key={version.id}
            onClick={() => onRestore(version.id)}
            className={cn(
              "w-full text-left px-3 py-2 border-l-2 transition-colors hover:bg-surface",
              isActive
                ? "bg-gold-pure/10 border-l-gold-pure"
                : "border-l-transparent",
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn("text-[11px] font-heading", isActive ? "text-gold-pure" : "text-text-secondary")}>
                v{version.versionNumber}
              </span>
              <span className="text-[9px] text-text-muted">
                {fileCount} files
              </span>
            </div>
            <p className="text-[9px] text-text-muted mt-0.5 truncate">
              {version.prompt}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[8px] text-text-muted">
                {version.model}
              </span>
              <span className="text-[8px] text-text-muted">
                {format(new Date(version.createdAt), "HH:mm")}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
