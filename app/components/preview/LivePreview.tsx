import { useCallback, useEffect, useRef, useState } from "react";
import { assemblePreviewHtml } from "~/lib/utils/htmlAssembler";
import { cn } from "~/lib/utils/cn";
import { useT } from "~/lib/utils/i18n";

interface LivePreviewProps {
  files: Record<string, string>;
  isStreaming?: boolean;
}

type ConsoleEntry = {
  id: number;
  level: "log" | "warn" | "error" | "info";
  text: string;
};

type PreviewError = {
  message: string;
  pos: string;
};

type Viewport = { label: string; width: string; icon: string };

const VIEWPORTS: Viewport[] = [
  { label: "Mobile", width: "375px", icon: "M4 2h8a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm3 14h2" },
  { label: "Tablet", width: "768px", icon: "M3 2h10a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm4 14h2" },
  { label: "Desktop", width: "100%", icon: "M2 3h12a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1zm3 12h6" },
];

const STREAMING_DEBOUNCE_MS = 1500;
const IDLE_DEBOUNCE_MS = 300;
const MAX_CONSOLE_ENTRIES = 100;

let consoleIdCounter = 0;

export function LivePreview({ files, isStreaming = false }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastHtmlRef = useRef("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState<PreviewError | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [viewport, setViewport] = useState<Viewport>(VIEWPORTS[2]!);
  const t = useT();

  const updatePreview = useCallback((html: string) => {
    if (!html || html === lastHtmlRef.current) return;
    lastHtmlRef.current = html;

    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    setPreviewUrl(url);
    setPreviewError(null);
    setConsoleEntries([]);
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "preview-console") {
        const entry: ConsoleEntry = {
          id: ++consoleIdCounter,
          level: data.level ?? "log",
          text: Array.isArray(data.args) ? data.args.join(" ") : String(data.args),
        };
        setConsoleEntries((prev) =>
          prev.length >= MAX_CONSOLE_ENTRIES ? [...prev.slice(-50), entry] : [...prev, entry],
        );
      }

      if (data.type === "preview-error") {
        setPreviewError({ message: data.message ?? "Unknown error", pos: data.pos ?? "" });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (Object.keys(files).length === 0) {
      lastHtmlRef.current = "";
      setPreviewUrl("");
      return;
    }

    const delay = isStreaming ? STREAMING_DEBOUNCE_MS : IDLE_DEBOUNCE_MS;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        const html = assemblePreviewHtml(files);
        updatePreview(html);
      } catch (err) {
        setPreviewError({
          message: err instanceof Error ? err.message : "Assembly failed",
          pos: "",
        });
      }
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [files, isStreaming, updatePreview]);

  useEffect(() => {
    if (!isStreaming && Object.keys(files).length > 0) {
      try {
        const html = assemblePreviewHtml(files);
        updatePreview(html);
      } catch (err) {
        setPreviewError({
          message: err instanceof Error ? err.message : "Assembly failed",
          pos: "",
        });
      }
    }
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const handleRefresh = useCallback(() => {
    if (!previewUrl) return;
    setPreviewError(null);
    setConsoleEntries([]);
    if (iframeRef.current) iframeRef.current.src = previewUrl;
  }, [previewUrl]);

  const handleOpenExternal = useCallback(() => {
    const html = lastHtmlRef.current;
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }, []);

  const hasFiles = Object.keys(files).length > 0;
  const errorCount = consoleEntries.filter((e) => e.level === "error").length;
  const warnCount = consoleEntries.filter((e) => e.level === "warn").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 border-b border-border-subtle bg-deep-space/40">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-heading uppercase tracking-wider text-text-muted">{t("preview.title")}</span>
          {isStreaming && (
            <span className="text-[9px] text-neon-cyan animate-pulse">{t("preview.streaming")}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {VIEWPORTS.map((vp) => (
            <button
              key={vp.label}
              onClick={() => setViewport(vp)}
              className={cn(
                "p-1 transition-colors",
                viewport.label === vp.label ? "text-gold-pure" : "text-text-muted hover:text-text-primary",
              )}
              title={vp.label}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d={vp.icon} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
          <div className="w-px h-3 bg-border-subtle mx-0.5" />
          <button
            onClick={() => setConsoleOpen((v) => !v)}
            className={cn(
              "p-1 text-[9px] font-mono transition-colors",
              consoleOpen ? "text-gold-pure" : "text-text-muted hover:text-text-primary",
            )}
            title="Console"
          >
            {">_"}
            {(errorCount > 0 || warnCount > 0) && (
              <span className={cn("ml-0.5 text-[8px]", errorCount > 0 ? "text-red-400" : "text-yellow-400")}>
                {errorCount > 0 ? errorCount : warnCount}
              </span>
            )}
          </button>
          <button
            onClick={handleRefresh}
            disabled={!hasFiles}
            className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-30"
            title="Refresh"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 8a6 6 0 0 1 10.3-4.2L14 2v4h-4l1.7-1.7A4.5 4.5 0 1 0 12.5 8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={handleOpenExternal}
            disabled={!hasFiles}
            className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-30"
            title="Open in new tab"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M10 2h4v4M7 9l7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative flex flex-col">
        <div className="flex-1 min-h-0 relative flex items-start justify-center overflow-auto bg-[#1a1a2e]">
          {previewError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-void-black/90 p-4">
              <div className="text-center space-y-2 max-w-sm">
                {previewError.pos && (
                  <p className="text-yellow-400 text-[10px] font-mono">{previewError.pos}</p>
                )}
                <p className="text-red-400 text-xs font-mono whitespace-pre-wrap">{previewError.message}</p>
                <button
                  onClick={handleRefresh}
                  className="text-[10px] text-gold-pure hover:underline"
                >
                  {t("preview.retry")}
                </button>
              </div>
            </div>
          )}

          {!hasFiles && !previewUrl ? (
            <div className="h-full w-full flex items-center justify-center">
              <div className="text-center space-y-2">
                <div className="text-2xl opacity-20">&#9654;</div>
                <p className="text-text-muted text-xs">{t("preview.placeholder")}</p>
              </div>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={previewUrl || "about:blank"}
              style={{ width: viewport.width, maxWidth: "100%" }}
              className={cn("h-full bg-white transition-all duration-200", isStreaming && "opacity-90")}
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups"
              title="Live Preview"
            />
          )}

          {isStreaming && hasFiles && (
            <div className="absolute bottom-3 right-3 z-10">
              <div className="bg-deep-space/80 backdrop-blur-sm border border-neon-cyan/30 rounded px-2 py-1">
                <span className="text-[9px] text-neon-cyan animate-pulse">&#9679; {t("preview.updating")}</span>
              </div>
            </div>
          )}
        </div>

        {consoleOpen && (
          <div className="flex-shrink-0 h-32 border-t border-border-subtle bg-void-black overflow-y-auto font-mono text-[10px] leading-relaxed">
            <div className="sticky top-0 flex items-center justify-between px-2 py-0.5 bg-deep-space/80 border-b border-border-subtle">
              <span className="text-text-muted">Console</span>
              <button
                onClick={() => setConsoleEntries([])}
                className="text-text-muted hover:text-text-primary text-[9px]"
              >
                Clear
              </button>
            </div>
            {consoleEntries.length === 0 ? (
              <div className="px-2 py-2 text-text-muted">No output</div>
            ) : (
              consoleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "px-2 py-0.5 border-b border-border-subtle/30",
                    entry.level === "error" && "text-red-400 bg-red-400/5",
                    entry.level === "warn" && "text-yellow-400 bg-yellow-400/5",
                    entry.level === "info" && "text-neon-cyan",
                    entry.level === "log" && "text-text-secondary",
                  )}
                >
                  <span className="opacity-50 mr-1">[{entry.level}]</span>
                  {entry.text}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
