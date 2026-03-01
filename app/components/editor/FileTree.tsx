import { cn } from "~/lib/utils/cn";

interface FileTreeProps {
  files: Record<string, string>;
  activeFile: string;
  onSelectFile: (path: string) => void;
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

export function FileTree({ files, activeFile, onSelectFile }: FileTreeProps) {
  const paths = Object.keys(files).sort();

  if (paths.length === 0) {
    return (
      <div className="p-3 text-text-muted text-xs text-center">
        No files generated yet
      </div>
    );
  }

  return (
    <div className="py-1">
      {paths.map((path) => (
        <button
          key={path}
          onClick={() => onSelectFile(path)}
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
          <span className="truncate">{path}</span>
        </button>
      ))}
    </div>
  );
}
