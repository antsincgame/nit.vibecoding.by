import {
  SandpackProvider,
  SandpackPreview as SandpackPreviewComponent,
  SandpackCodeEditor,
  SandpackConsole,
} from "@codesandbox/sandpack-react";
import { useMemo, useState } from "react";
import { cn } from "~/lib/utils/cn";

type SandpackTemplate = "react-ts" | "vanilla" | "static" | "vue-ts";

interface SandpackPreviewProps {
  files: Record<string, string>;
  template?: SandpackTemplate;
  showEditor?: boolean;
}

function detectTemplate(files: Record<string, string>): SandpackTemplate {
  const paths = Object.keys(files);

  const hasVue = paths.some((p) => p.endsWith(".vue"));
  if (hasVue) return "vue-ts";

  const hasReact = paths.some((p) => p.endsWith(".tsx") || p.endsWith(".jsx"));
  if (hasReact) return "react-ts";

  const hasHtml = paths.some(
    (p) => p === "/index.html" || p === "index.html",
  );
  if (hasHtml) return "static";

  const hasJs = paths.some((p) => p.endsWith(".ts") || p.endsWith(".js"));
  if (hasJs) return "vanilla";

  return "static";
}

function injectReactEntry(files: Record<string, string>): Record<string, string> {
  if (files["/index.tsx"]) return files;

  const appPath = files["/src/App.tsx"] ? "./src/App"
    : files["/App.tsx"] ? "./App"
    : null;

  if (!appPath) return files;

  const cssImportPath = files["/src/index.css"] ? "./src/index.css"
    : files["/index.css"] ? "./index.css"
    : null;

  const lines = [
    'import { StrictMode } from "react";',
    'import { createRoot } from "react-dom/client";',
    cssImportPath ? `import "${cssImportPath}";` : "",
    `import App from "${appPath}";`,
    'createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);',
  ].filter(Boolean);

  return { ...files, "/index.tsx": lines.join("\n") };
}

const NEON_SANDPACK_THEME = {
  colors: {
    surface1: "#0a0a0f",
    surface2: "#12121f",
    surface3: "#1a1a2e",
    clickable: "#9898b0",
    base: "#e8e8f0",
    disabled: "#686880",
    hover: "#ffd700",
    accent: "#ffd700",
    error: "#ff4444",
    errorSurface: "#12121f",
  },
  syntax: {
    plain: "#e8e8f0",
    comment: { color: "#686880", fontStyle: "italic" as const },
    keyword: "#ffd700",
    tag: "#ffd700",
    punctuation: "#9898b0",
    definition: "#f4a836",
    property: "#8b5cf6",
    static: "#ff00ff",
    string: "#00f5ff",
  },
  font: {
    body: "'Inter', sans-serif",
    mono: "'JetBrains Mono', monospace",
    size: "13px",
    lineHeight: "1.6",
  },
};

export function SandpackPreview({
  files,
  template,
  showEditor = false,
}: SandpackPreviewProps) {
  const [consoleOpen, setConsoleOpen] = useState(false);

  const sandpackFiles = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;
      result[normalizedPath] = content;
    }
    return result;
  }, [files]);

  const resolvedTemplate = useMemo(
    () => template ?? detectTemplate(sandpackFiles),
    [template, sandpackFiles],
  );

  const finalFiles = useMemo(
    () => resolvedTemplate === "react-ts" ? injectReactEntry(sandpackFiles) : sandpackFiles,
    [resolvedTemplate, sandpackFiles],
  );

  const hasFiles = Object.keys(finalFiles).length > 0;

  if (!hasFiles) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-xs bg-void-black">
        Preview will appear after code generation
      </div>
    );
  }

  return (
    <SandpackProvider
      template={resolvedTemplate}
      files={finalFiles}
      theme={NEON_SANDPACK_THEME}
      options={{
        recompileMode: "delayed",
        recompileDelay: 500,
      }}
    >
      <div className="flex flex-col h-full">
        {showEditor && (
          <div className="h-1/2 border-b border-border-subtle">
            <SandpackCodeEditor
              showTabs
              showLineNumbers
              showInlineErrors
              style={{ height: "100%" }}
            />
          </div>
        )}

        <div className={cn("flex-1 min-h-0", showEditor && "max-h-[50%]")}>
          <SandpackPreviewComponent
            showNavigator
            showRefreshButton
            style={{ height: "100%" }}
          />
        </div>

        <div className="flex-shrink-0 border-t border-border-subtle">
          <button
            onClick={() => setConsoleOpen((prev) => !prev)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono transition-colors",
              consoleOpen ? "bg-surface text-gold-pure" : "bg-deep-space/60 text-text-muted hover:text-text-secondary",
            )}
          >
            <span>Console</span>
            <span>{consoleOpen ? "\u25BC" : "\u25B2"}</span>
          </button>
          {consoleOpen && (
            <div className="h-[180px] overflow-hidden">
              <SandpackConsole
                showHeader={false}
                showSyntaxError
                resetOnPreviewRestart
                maxMessageCount={50}
                style={{ height: "100%" }}
              />
            </div>
          )}
        </div>
      </div>
    </SandpackProvider>
  );
}
