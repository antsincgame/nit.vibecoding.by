import { useCallback, useEffect, useRef, useState } from "react";
import { assemblePreviewHtml } from "~/lib/utils/htmlAssembler";
import { cn } from "~/lib/utils/cn";

interface LivePreviewProps {
  files: Record<string, string>;
  isStreaming?: boolean;
}

const STREAMING_DEBOUNCE_MS = 1500;
const IDLE_DEBOUNCE_MS = 300;

export function LivePreview({ files, isStreaming = false }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastHtmlRef = useRef("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updatePreview = useCallback((html: string) => {
    if (!html || html === lastHtmlRef.current) return;
    lastHtmlRef.current = html;

    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    setPreviewUrl(url);
    setError(null);
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
        setError(err instanceof Error ? err.message : "Assembly failed");
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
        setError(err instanceof Error ? err.message : "Assembly failed");
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 border-b border-border-subtle bg-deep-space/40">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-heading uppercase tracking-wider text-text-muted">Preview</span>
          {isStreaming && (
            <span className="text-[9px] text-neon-cyan animate-pulse">streaming...</span>
          )}
        </div>
        <div className="flex items-center gap-1">
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

      <div className="flex-1 min-h-0 relative">
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-void-black/90 p-4">
            <div className="text-center space-y-2 max-w-sm">
              <p className="text-red-400 text-xs font-mono">{error}</p>
              <button
                onClick={handleRefresh}
                className="text-[10px] text-gold-pure hover:underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!hasFiles && !previewUrl ? (
          <div className="h-full flex items-center justify-center bg-deep-space/20">
            <div className="text-center space-y-2">
              <div className="text-2xl opacity-20">&#9654;</div>
              <p className="text-text-muted text-xs">Preview will appear here</p>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={previewUrl || "about:blank"}
            className={cn("w-full h-full bg-white", isStreaming && "opacity-90")}
            sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups"
            title="Live Preview"
          />
        )}

        {isStreaming && hasFiles && (
          <div className="absolute bottom-3 right-3 z-10">
            <div className="bg-deep-space/80 backdrop-blur-sm border border-neon-cyan/30 rounded px-2 py-1">
              <span className="text-[9px] text-neon-cyan animate-pulse">&#9679; Updating...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
