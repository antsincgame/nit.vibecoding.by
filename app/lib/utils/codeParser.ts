const FILE_MARKER = /^\/\/\s*===\s*FILE:\s*(.+?)\s*===\s*$/;
const HTML_COMMENT_MARKER = /^<!--\s*FILE:\s*(.+?)\s*-->$/;
const HASH_MARKER = /^#\s*===\s*FILE:\s*(.+?)\s*===\s*$/;
const MARKDOWN_BLOCK_START = /^```(\w*)\s+(.+)$/;
const MARKDOWN_BLOCK_START_COLON = /^```(\w*):(.+)$/;
const MARKDOWN_BLOCK_END = /^```\s*$/;

function tryFileMarker(line: string): string | null {
  const trimmed = line.trim();
  const m1 = FILE_MARKER.exec(trimmed);
  if (m1?.[1]) return m1[1].trim();

  const m2 = HTML_COMMENT_MARKER.exec(trimmed);
  if (m2?.[1]) return m2[1].trim();

  const m3 = HASH_MARKER.exec(trimmed);
  if (m3?.[1]) return m3[1].trim();

  return null;
}

function parseWithMarkers(lines: string[]): Record<string, string> {
  const files: Record<string, string> = {};
  let currentFile: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const filePath = tryFileMarker(line);

    if (filePath) {
      if (currentFile) {
        files[currentFile] = currentContent.join("\n").trim();
      }
      currentFile = filePath;
      currentContent = [];
    } else if (currentFile) {
      currentContent.push(line);
    }
  }

  if (currentFile) {
    files[currentFile] = currentContent.join("\n").trim();
  }

  return files;
}

function parseMarkdownBlocks(lines: string[]): Record<string, string> {
  const files: Record<string, string> = {};
  let currentFile: string | null = null;
  let currentContent: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    if (inBlock) {
      if (MARKDOWN_BLOCK_END.test(line.trim())) {
        if (currentFile) {
          files[currentFile] = currentContent.join("\n").trim();
        }
        currentFile = null;
        currentContent = [];
        inBlock = false;
      } else {
        currentContent.push(line);
      }
      continue;
    }

    const m1 = MARKDOWN_BLOCK_START.exec(line.trim());
    if (m1?.[2]) {
      const path = m1[2].trim();
      if (path.includes(".")) {
        currentFile = path;
        currentContent = [];
        inBlock = true;
        continue;
      }
    }

    const m2 = MARKDOWN_BLOCK_START_COLON.exec(line.trim());
    if (m2?.[2]) {
      const path = m2[2].trim();
      if (path.includes(".")) {
        currentFile = path;
        currentContent = [];
        inBlock = true;
        continue;
      }
    }
  }

  if (currentFile && currentContent.length > 0) {
    files[currentFile] = currentContent.join("\n").trim();
  }

  return files;
}

function unwrapSingleMarkdownBlock(raw: string): string {
  const trimmed = raw.trim();
  const lines = trimmed.split("\n");

  if (lines.length < 3) return raw;
  const firstLine = lines[0] ?? "";
  const lastLine = lines[lines.length - 1] ?? "";
  if (!firstLine.startsWith("```") || !lastLine.trim().startsWith("```")) return raw;

  const innerLines = lines.slice(1, -1);
  return innerLines.join("\n");
}

function detectFilenameFromContent(content: string): string {
  const trimmed = content.trim();

  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<head")) {
    return "index.html";
  }
  if (trimmed.startsWith("<template") || trimmed.includes("<script setup")) {
    return "App.vue";
  }
  if (trimmed.includes("createRoot") || trimmed.includes("ReactDOM")) {
    return "src/main.tsx";
  }
  if (trimmed.includes("export default function") || trimmed.includes("export function App")) {
    return "src/App.tsx";
  }
  if (trimmed.startsWith("import React") || trimmed.includes("useState") || trimmed.includes("JSX")) {
    return "src/App.tsx";
  }

  return "App.tsx";
}

const THINK_BLOCK_RE = /<think(?:ing)?>\s*[\s\S]*?<\/think(?:ing)?>\s*/gi;
const UNCLOSED_THINK_RE = /<think(?:ing)?>[\s\S]*$/i;

function stripThinkBlocks(raw: string): string {
  let cleaned = raw.replace(THINK_BLOCK_RE, "");
  cleaned = cleaned.replace(UNCLOSED_THINK_RE, "");
  return cleaned;
}

function stripPreamble(text: string): string {
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (tryFileMarker(line)) return lines.slice(i).join("\n");
    if (/^```\w*[\s:]/.test(line) || /^```\w*$/.test(line)) return lines.slice(i).join("\n");
    if (line.startsWith("<!DOCTYPE") || line.startsWith("<html")) return lines.slice(i).join("\n");
    if (/^<(nit|bolt)Artifact\b/i.test(line)) return lines.slice(i).join("\n");
  }

  return text;
}

const NIT_ACTION_RE = /<nitAction\s+type="file"\s+filePath="([^"]+)"\s*>([\s\S]*?)<\/nitAction>/gi;
const BOLT_ACTION_RE = /<boltAction\s+type="file"\s+filePath="([^"]+)"\s*>([\s\S]*?)<\/boltAction>/gi;

function parseArtifactProtocol(text: string): Record<string, string> {
  const files: Record<string, string> = {};

  for (const re of [NIT_ACTION_RE, BOLT_ACTION_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const filePath = match[1]?.trim();
      const content = match[2]?.trim();
      if (filePath && content) {
        files[filePath] = content;
      }
    }
    if (Object.keys(files).length > 0) return files;
  }

  return files;
}

const UNCLOSED_ARTIFACT_RE = /^<(nit|bolt)Artifact\b/i;

export function parseGeneratedCode(rawOutput: string): Record<string, string> {
  if (!rawOutput.trim()) return {};

  const cleaned = stripPreamble(stripThinkBlocks(rawOutput)).trim();
  if (!cleaned) return {};

  const artifactFiles = parseArtifactProtocol(cleaned);
  if (Object.keys(artifactFiles).length > 0) return artifactFiles;

  // Artifact block opened but no nitAction has closed yet — still streaming, don't fallback
  if (UNCLOSED_ARTIFACT_RE.test(cleaned)) return {};

  const unwrapped = unwrapSingleMarkdownBlock(cleaned);
  const lines = unwrapped.split("\n");

  const markerFiles = parseWithMarkers(lines);
  if (Object.keys(markerFiles).length > 0) return markerFiles;

  const markdownFiles = parseMarkdownBlocks(lines);
  if (Object.keys(markdownFiles).length > 0) return markdownFiles;

  const filename = detectFilenameFromContent(cleaned);
  return { [filename]: cleaned };
}

export function extractChatText(rawContent: string): string {
  const hasUnclosedThink = UNCLOSED_THINK_RE.test(
    rawContent.replace(THINK_BLOCK_RE, ""),
  );

  let cleaned = rawContent.replace(THINK_BLOCK_RE, "");
  cleaned = cleaned.replace(UNCLOSED_THINK_RE, "");

  cleaned = cleaned.replace(/<nitArtifact[\s\S]*?<\/nitArtifact>/gi, "");
  cleaned = cleaned.replace(/<nitArtifact[\s\S]*$/i, "");
  cleaned = cleaned.replace(/<boltArtifact[\s\S]*?<\/boltArtifact>/gi, "");
  cleaned = cleaned.replace(/<boltArtifact[\s\S]*$/i, "");

  const markerIdx = cleaned.search(/\/\/\s*===\s*FILE:\s*/);
  if (markerIdx > 0) {
    cleaned = cleaned.slice(0, markerIdx);
  } else if (markerIdx === 0) {
    cleaned = "";
  }

  cleaned = cleaned.replace(/```[\w.:/-]*\n[\s\S]*?```/g, "");
  cleaned = cleaned.replace(/```[\s\S]*$/g, "");

  cleaned = cleaned.replace(/<!DOCTYPE[\s\S]*?(?:<\/html>|$)/gi, "");
  cleaned = cleaned.replace(/<html[\s\S]*?(?:<\/html>|$)/gi, "");

  cleaned = cleaned.trim();

  if (!cleaned && hasUnclosedThink) return "";
  return cleaned || "";
}

export function extractGeneratedFileNames(rawContent: string): string[] {
  const cleaned = stripPreamble(stripThinkBlocks(rawContent)).trim();
  if (!cleaned) return [];

  const names: string[] = [];
  for (const line of cleaned.split("\n")) {
    const marker = tryFileMarker(line);
    if (marker) names.push(marker);

    const md1 = MARKDOWN_BLOCK_START.exec(line.trim());
    if (md1?.[2]?.includes(".")) names.push(md1[2].trim());

    const md2 = MARKDOWN_BLOCK_START_COLON.exec(line.trim());
    if (md2?.[2]?.includes(".")) names.push(md2[2].trim());

    const nitMatch = /filePath="([^"]+)"/.exec(line);
    if (nitMatch?.[1]) names.push(nitMatch[1]);
  }

  return [...new Set(names)];
}

export function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    md: "markdown",
    vue: "vue",
    svg: "xml",
  };
  return langMap[ext] ?? "plaintext";
}
