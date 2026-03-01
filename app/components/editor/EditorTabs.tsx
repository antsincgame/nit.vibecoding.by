import { cn } from "~/lib/utils/cn";

interface EditorTabsProps {
  files: string[];
  activeFile: string;
  onSelectFile: (path: string) => void;
  onCloseFile?: (path: string) => void;
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function EditorTabs({ files, activeFile, onSelectFile, onCloseFile }: EditorTabsProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex items-center border-b border-border-subtle bg-deep-space/40 overflow-x-auto">
      {files.map((path) => (
        <button
          key={path}
          onClick={() => onSelectFile(path)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-[11px] font-mono border-r border-border-subtle whitespace-nowrap",
            "transition-colors",
            path === activeFile
              ? "bg-void-black text-gold-pure border-b-2 border-b-gold-pure -mb-px"
              : "text-text-muted hover:text-text-secondary hover:bg-surface",
          )}
        >
          <span>{getFileName(path)}</span>
          {onCloseFile && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onCloseFile(path);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  onCloseFile(path);
                }
              }}
              className="text-text-muted hover:text-red-400 transition-colors"
            >
              &times;
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
