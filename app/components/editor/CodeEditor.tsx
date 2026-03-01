import { useCallback, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { NEON_THEME_NAME, neonThemeData } from "./neonTheme";

interface CodeEditorProps {
  value: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  path?: string;
  fontSize?: number;
}

export function CodeEditor({
  value,
  language = "typescript",
  readOnly = false,
  onChange,
  path,
  fontSize = 13,
}: CodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.defineTheme(NEON_THEME_NAME, neonThemeData);
    monaco.editor.setTheme(NEON_THEME_NAME);

    editor.updateOptions({
      fontSize,
      fontFamily: "'JetBrains Mono', monospace",
      fontLigatures: true,
      lineHeight: 1.6,
      padding: { top: 16, bottom: 16 },
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      cursorBlinking: "smooth",
      smoothScrolling: true,
    });
  }, []);

  const handleChange = useCallback(
    (val: string | undefined) => {
      if (val !== undefined) onChange?.(val);
    },
    [onChange],
  );

  return (
    <div className="h-full w-full overflow-hidden rounded bg-void-black">
      <Editor
        height="100%"
        language={language}
        value={value}
        path={path}
        onChange={handleChange}
        onMount={handleMount}
        theme={NEON_THEME_NAME}
        options={{ readOnly }}
        loading={
          <div className="flex items-center justify-center h-full text-text-muted text-xs">
            Loading editor...
          </div>
        }
      />
    </div>
  );
}
