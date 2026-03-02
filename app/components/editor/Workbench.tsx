import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useChatStore } from "~/lib/stores/chatStore";
import { useProjectStore } from "~/lib/stores/projectStore";
import { useSettingsStore } from "~/lib/stores/settingsStore";
import { parseGeneratedCode, detectLanguage } from "~/lib/utils/codeParser";
import { formatAllFiles } from "~/lib/utils/formatCode";
import { exportProjectAsZip, downloadBlob } from "~/features/projects/service/exportService";
import { CodeEditor } from "./CodeEditor";
import { FileTree } from "./FileTree";
import { EditorTabs } from "./EditorTabs";
import { LivePreview } from "~/components/preview/LivePreview";
import { NeonButton } from "~/components/ui/NeonButton";
import { cn } from "~/lib/utils/cn";
import { useT } from "~/lib/utils/i18n";

type ViewMode = "editor" | "preview" | "split";

export function Workbench() {
  const { messages, streaming, generatedCode, setGeneratedCode } = useChatStore();
  const { currentProject, versions } = useProjectStore();
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const t = useT();
  const [activeFile, setActiveFile] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [isFormatting, setIsFormatting] = useState(false);
  const wasStreamingRef = useRef(false);

  const files = useMemo(() => {
    if (!streaming.isStreaming && Object.keys(generatedCode).length > 0) {
      return generatedCode;
    }
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
    if (!lastAssistant) return generatedCode;
    const parsed = parseGeneratedCode(lastAssistant.content);
    return Object.keys(parsed).length > 0 ? parsed : generatedCode;
  }, [messages, generatedCode, streaming.isStreaming]);

  const fileList = useMemo(() => Object.keys(files), [files]);

  useEffect(() => {
    if (fileList.length > 0 && (!activeFile || files[activeFile] === undefined)) {
      setActiveFile(fileList[0] ?? "");
    }
  }, [fileList.length]);

  useEffect(() => {
    if (wasStreamingRef.current && !streaming.isStreaming) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
      if (lastAssistant?.content) {
        const parsed = parseGeneratedCode(lastAssistant.content);
        if (Object.keys(parsed).length > 0) {
          setGeneratedCode(parsed);
        }
      }
    }
    wasStreamingRef.current = streaming.isStreaming;
  }, [streaming.isStreaming]);

  const effectiveActiveFile = activeFile && files[activeFile] !== undefined
    ? activeFile
    : fileList[0] ?? "";

  const handleCodeChange = useCallback(
    (value: string) => {
      if (!effectiveActiveFile) return;
      setGeneratedCode({ ...files, [effectiveActiveFile]: value });
    },
    [effectiveActiveFile, files, setGeneratedCode],
  );

  const handleFormat = useCallback(async () => {
    setIsFormatting(true);
    try {
      const formatted = await formatAllFiles(files);
      setGeneratedCode(formatted);
    } finally {
      setIsFormatting(false);
    }
  }, [files, setGeneratedCode]);

  const handleExport = useCallback(async () => {
    if (!currentProject) return;
    const blob = await exportProjectAsZip(currentProject, versions);
    downloadBlob(blob, `${currentProject.name.replace(/\s+/g, "-")}.zip`);
  }, [currentProject, versions]);

  const handleCopy = useCallback(() => {
    const content = files[effectiveActiveFile];
    if (content) navigator.clipboard.writeText(content);
  }, [files, effectiveActiveFile]);

  const handleCreateFile = useCallback(
    (path: string) => {
      if (files[path] !== undefined) return;
      setGeneratedCode({ ...files, [path]: "" });
      setActiveFile(path);
    },
    [files, setGeneratedCode],
  );

  const handleDeleteFile = useCallback(
    (path: string) => {
      const updated = { ...files };
      delete updated[path];
      setGeneratedCode(updated);
      if (effectiveActiveFile === path) {
        const remaining = Object.keys(updated);
        setActiveFile(remaining[0] ?? "");
      }
    },
    [files, effectiveActiveFile, setGeneratedCode],
  );

  const handleRenameFile = useCallback(
    (oldPath: string, newPath: string) => {
      if (files[newPath] !== undefined || files[oldPath] === undefined) return;
      const content = files[oldPath]!;
      const updated = { ...files };
      delete updated[oldPath];
      updated[newPath] = content;
      setGeneratedCode(updated);
      if (effectiveActiveFile === oldPath) {
        setActiveFile(newPath);
      }
    },
    [files, effectiveActiveFile, setGeneratedCode],
  );

  const hasFiles = fileList.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border-subtle bg-deep-space/40">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted font-mono">
            {hasFiles ? `${fileList.length} ${t("workbench.files")}` : t("workbench.no_files")}
          </span>
          {hasFiles && (
            <>
              <NeonButton variant="ghost" size="sm" onClick={handleCopy}>{t("workbench.copy")}</NeonButton>
              <NeonButton variant="ghost" size="sm" onClick={handleFormat} disabled={isFormatting}>
                {isFormatting ? "..." : t("workbench.format")}
              </NeonButton>
              {currentProject && (
                <NeonButton variant="ghost" size="sm" onClick={handleExport}>{t("workbench.export")}</NeonButton>
              )}
            </>
          )}
        </div>
        <div className="flex gap-1">
          {(["editor", "split", "preview"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-heading uppercase tracking-wider rounded transition-colors",
                viewMode === mode ? "bg-gold-pure/15 text-gold-pure" : "text-text-muted hover:text-text-secondary",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {viewMode !== "preview" && (
          <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
            {hasFiles && (
              <div className="w-40 flex-shrink-0 border-r border-border-subtle overflow-y-auto bg-deep-space/20">
                <FileTree
                  files={files}
                  activeFile={effectiveActiveFile}
                  onSelectFile={setActiveFile}
                  onCreateFile={handleCreateFile}
                  onDeleteFile={handleDeleteFile}
                  onRenameFile={handleRenameFile}
                />
              </div>
            )}

            <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
              {hasFiles && (
                <div className="flex-shrink-0">
                  <EditorTabs
                    files={fileList}
                    activeFile={effectiveActiveFile}
                    onSelectFile={setActiveFile}
                  />
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-hidden">
                {hasFiles ? (
                  <CodeEditor
                    value={files[effectiveActiveFile] ?? ""}
                    language={detectLanguage(effectiveActiveFile)}
                    path={effectiveActiveFile}
                    onChange={handleCodeChange}
                    fontSize={editorFontSize}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center space-y-2">
                      <div className="text-2xl opacity-20">{"</>"}</div>
                      <p className="text-text-muted text-xs">{t("workbench.code_here")}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {viewMode === "split" && <div className="w-px bg-border-subtle flex-shrink-0" />}

        {viewMode !== "editor" && (
          <div className={cn("min-w-0 min-h-0 overflow-hidden", viewMode === "split" ? "w-1/2 flex-shrink-0" : "flex-1")}>
            <LivePreview files={files} isStreaming={streaming.isStreaming} />
          </div>
        )}
      </div>
    </div>
  );
}
