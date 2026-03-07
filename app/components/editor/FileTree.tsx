import { useState, useCallback } from "react";
import { cn } from "~/lib/utils/cn";
import { useT } from "~/lib/utils/i18n";

interface FileTreeProps {
  files: Record<string, string>;
  activeFile: string;
  onSelectFile: (path: string) => void;
  onCreateFile?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
}

function getFileIcon(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) return "R";
  if (path.endsWith(".ts") || path.endsWith(".js")) return "J";
  if (path.endsWith(".css") || path.endsWith(".scss")) return "S";
  if (path.endsWith(".html")) return "H";
  if (path.endsWith(".json")) return "{";
  return "F";
}

function getFileColor(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) return "text-neon-cyan";
  if (path.endsWith(".ts") || path.endsWith(".js")) return "text-gold-pure";
  if (path.endsWith(".css") || path.endsWith(".scss")) return "text-neon-magenta";
  if (path.endsWith(".html")) return "text-neon-emerald";
  return "text-text-muted";
}

export function FileTree({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
}: FileTreeProps) {
  const t = useT();
  const paths = Object.keys(files).sort();
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextPath, setContextPath] = useState<string | null>(null);

  const handleCreate = useCallback(() => {
    const trimmed = newFileName.trim();
    if (trimmed && onCreateFile) {
      onCreateFile(trimmed);
    }
    setNewFileName("");
    setIsCreating(false);
  }, [newFileName, onCreateFile]);

  const handleRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && renamingPath && onRenameFile && trimmed !== renamingPath) {
      onRenameFile(renamingPath, trimmed);
    }
    setRenamingPath(null);
    setRenameValue("");
  }, [renameValue, renamingPath, onRenameFile]);

  return (
    <div className="py-1 relative">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[9px] font-heading uppercase tracking-[0.15em] text-text-muted">{t("file.title")}</span>
        {onCreateFile && (
          <button
            onClick={() => setIsCreating(true)}
            className="text-[10px] text-text-muted hover:text-gold-pure transition-colors"
            title={t("file.new")}
          >
            +
          </button>
        )}
      </div>

      {isCreating && (
        <div className="px-2 py-1">
          <input
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setIsCreating(false);
            }}
            onBlur={handleCreate}
            placeholder="filename.tsx"
            className="w-full bg-deep-space border border-gold-pure/40 rounded px-2 py-0.5 text-[10px] font-mono text-text-primary outline-none"
          />
        </div>
      )}

      {paths.length === 0 && !isCreating && (
        <div className="p-3 text-text-muted text-xs text-center">
          {t("file.no_files")}
        </div>
      )}

      {paths.map((path) => (
        <div key={path} className="relative group">
          {renamingPath === path ? (
            <div className="px-2 py-1">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setRenamingPath(null);
                }}
                onBlur={handleRename}
                className="w-full bg-deep-space border border-gold-pure/40 rounded px-2 py-0.5 text-[10px] font-mono text-text-primary outline-none"
              />
            </div>
          ) : (
            <button
              onClick={() => {
                setContextPath(null);
                onSelectFile(path);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextPath(contextPath === path ? null : path);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-mono",
                "transition-colors hover:bg-surface",
                path === activeFile
                  ? "bg-gold-pure/10 text-gold-pure border-l-2 border-gold-pure"
                  : "text-text-secondary border-l-2 border-transparent",
              )}
            >
              <span className={cn("text-[10px] font-bold w-3", getFileColor(path))}>
                {getFileIcon(path)}
              </span>
              <span className="truncate flex-1">{path}</span>
              {(onDeleteFile || onRenameFile) && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextPath(contextPath === path ? null : path);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary text-[10px] px-1 transition-opacity cursor-pointer"
                >
                  ...
                </span>
              )}
            </button>
          )}

          {contextPath === path && (
            <div className="absolute right-2 top-full z-20 bg-deep-space border border-border-subtle rounded shadow-lg py-1 min-w-[100px]">
              {onRenameFile && (
                <button
                  onClick={() => {
                    setRenamingPath(path);
                    setRenameValue(path);
                    setContextPath(null);
                  }}
                  className="w-full text-left px-3 py-1 text-[10px] text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
                >
                  {t("file.rename")}
                </button>
              )}
              {onDeleteFile && (
                <button
                  onClick={() => {
                    onDeleteFile(path);
                    setContextPath(null);
                  }}
                  className="w-full text-left px-3 py-1 text-[10px] text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  {t("common.delete")}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
