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

const ARTIFACT_OPEN_RE = /^<(nit|bolt)Artifact\b[^>]*>/i;
const ARTIFACT_CLOSE_RE = /<\/(nit|bolt)Artifact\s*>/gi;

function stripArtifactWrapper(text: string): string {
  let cleaned = text.replace(ARTIFACT_OPEN_RE, "");
  cleaned = cleaned.replace(ARTIFACT_CLOSE_RE, "");
  return cleaned.trim();
}

const NIT_ACTION_RE_FLEX = /<(?:nit|bolt)Action\s+(?=(?:[^>]*?\btype\s*=\s*"file"))(?=[^>]*?\bfilePath\s*=\s*"([^"]+)")[^>]*>([\s\S]*?)<\/(?:nit|bolt)Action\s*>/gi;

function parseArtifactProtocol(text: string): Record<string, string> {
  const files: Record<string, string> = {};

  NIT_ACTION_RE_FLEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NIT_ACTION_RE_FLEX.exec(text)) !== null) {
    const filePath = match[1]?.trim();
    const content = match[2]?.trim();
    if (filePath && content) {
      files[filePath] = content;
    }
  }

  return files;
}

const ERROR_MESSAGE_RE = /^(Error:|TypeError:|ReferenceError:|SyntaxError:|terminated$)/i;

const CODE_INDICATORS = [
  /\bimport\s+/,
  /\bexport\s+(default\s+)?(function|const|class|interface|type)\b/,
  /\bfunction\s+\w+\s*\(/,
  /\bconst\s+\w+\s*=/,
  /\blet\s+\w+\s*=/,
  /\breturn\s*\(/,
  /\buseState\b/,
  /\buseEffect\b/,
  /<\w+[\s/>]/,
  /\bclassName=/,
  /\bclass\s+\w+/,
  /\binterface\s+\w+/,
  /\{\s*\n/,
  /=>\s*[{(]/,
  /document\.\w+/,
  /@tailwind\b/,
  /\bbackground(-color)?:/,
  /\bdisplay\s*:/,
  /\bmargin\s*:|padding\s*:/,
  /<!DOCTYPE/i,
  /<html/i,
  /<template/,
  /<script/,
];

export function looksLikeCode(text: string): boolean {
  let hits = 0;
  for (const re of CODE_INDICATORS) {
    if (re.test(text)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

export function sanitizeVersionCode(code: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [path, content] of Object.entries(code)) {
    if (/\.(css|scss|html|json|svg|md)$/.test(path)) {
      result[path] = content;
      continue;
    }
    if (looksLikeCode(content)) {
      result[path] = content;
    }
  }
  return result;
}

const STRUCTURE_JSON_KEYS = ["project_name", "pages", "slug", "sections", "design", "navigation", "tech_notes"];

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = "";
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseJsonStructure(text: string): Record<string, string> | null {
  const trimmed = text.trim();
  if (trimmed.length < 50) return null;

  const jsonStr = trimmed.startsWith("{")
    ? trimmed
    : extractJsonObject(trimmed);
  if (!jsonStr) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const keys = Object.keys(parsed as Record<string, unknown>);
  const hasStructureKeys = STRUCTURE_JSON_KEYS.some((k) => keys.includes(k));
  if (!hasStructureKeys) return null;

  const formatted = JSON.stringify(parsed, null, 2);
  return { "structure.json": formatted };
}

export function parseGeneratedCode(rawOutput: string): Record<string, string> {
  if (!rawOutput.trim()) return {};

  const cleaned = stripPreamble(stripThinkBlocks(rawOutput)).trim();
  if (!cleaned) return {};

  if (cleaned.length < 30 && ERROR_MESSAGE_RE.test(cleaned)) return {};

  const artifactFiles = parseArtifactProtocol(cleaned);
  if (Object.keys(artifactFiles).length > 0) return artifactFiles;

  const hasArtifactWrapper = ARTIFACT_OPEN_RE.test(cleaned);
  const inner = hasArtifactWrapper ? stripArtifactWrapper(cleaned) : cleaned;

  if (!inner) return {};

  const unwrapped = unwrapSingleMarkdownBlock(inner);
  const lines = unwrapped.split("\n");

  const markerFiles = parseWithMarkers(lines);
  if (Object.keys(markerFiles).length > 0) return markerFiles;

  const markdownFiles = parseMarkdownBlocks(lines);
  if (Object.keys(markdownFiles).length > 0) return markdownFiles;

  if (hasArtifactWrapper && inner.length < 50) return {};

  const jsonArtifact = tryParseJsonStructure(inner) ?? tryParseJsonStructure(unwrapped);
  if (jsonArtifact) return jsonArtifact;

  if (!looksLikeCode(inner)) return {};

  const filename = detectFilenameFromContent(inner);
  return { [filename]: inner };
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

export type IncrementalFileCallback = (filePath: string, content: string) => void;

const ACTION_OPEN_RE = /<(?:nit|bolt)Action\s+(?=(?:[^>]*?\btype\s*=\s*"file"))(?=[^>]*?\bfilePath\s*=\s*"([^"]+)")[^>]*>/gi;
const ACTION_CLOSE_RE = /<\/(?:nit|bolt)Action\s*>/i;

export class IncrementalArtifactParser {
  private buffer = "";
  private currentFilePath: string | null = null;
  private currentContent = "";
  private files: Record<string, string> = {};
  private onFile: IncrementalFileCallback;
  private mode: "xml" | "marker" | "detect" = "detect";

  constructor(onFile: IncrementalFileCallback) {
    this.onFile = onFile;
  }

  push(chunk: string): void {
    this.buffer += chunk;
    this.drain();
  }

  getFiles(): Record<string, string> {
    return { ...this.files };
  }

  reset(): void {
    this.buffer = "";
    this.currentFilePath = null;
    this.currentContent = "";
    this.files = {};
    this.mode = "detect";
  }

  private drain(): void {
    if (this.mode === "detect") {
      this.detectMode();
    }

    if (this.mode === "xml") {
      this.drainXml();
    } else if (this.mode === "marker") {
      this.drainMarkers();
    }
  }

  private detectMode(): void {
    const hasXmlAction = ACTION_OPEN_RE.test(this.buffer);
    ACTION_OPEN_RE.lastIndex = 0;

    if (hasXmlAction) {
      this.mode = "xml";
      return;
    }

    if (FILE_MARKER.test(this.buffer.split("\n").find((l) => FILE_MARKER.test(l.trim())) ?? "")) {
      this.mode = "marker";
      return;
    }

    if (this.buffer.length > 500) {
      const lines = this.buffer.split("\n");
      for (const line of lines) {
        if (tryFileMarker(line)) {
          this.mode = "marker";
          return;
        }
      }
    }
  }

  private drainXml(): void {
    while (this.buffer.length > 0) {
      if (this.currentFilePath === null) {
        ACTION_OPEN_RE.lastIndex = 0;
        const openMatch = ACTION_OPEN_RE.exec(this.buffer);
        if (!openMatch) return;

        const filePath = openMatch[1]?.trim();
        if (!filePath) return;

        this.currentFilePath = filePath;
        this.currentContent = "";
        this.buffer = this.buffer.slice(openMatch.index + openMatch[0].length);
      } else {
        const closeMatch = ACTION_CLOSE_RE.exec(this.buffer);
        if (!closeMatch) {
          this.currentContent += this.buffer;
          this.buffer = "";
          return;
        }

        this.currentContent += this.buffer.slice(0, closeMatch.index);
        this.buffer = this.buffer.slice(closeMatch.index + closeMatch[0].length);

        const trimmed = this.currentContent.trim();
        if (trimmed) {
          this.files[this.currentFilePath] = trimmed;
          this.onFile(this.currentFilePath, trimmed);
        }

        this.currentFilePath = null;
        this.currentContent = "";
      }
    }
  }

  private drainMarkers(): void {
    const lines = this.buffer.split("\n");

    let lastCompleteLineIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i] !== undefined && i < lines.length - 1) {
        lastCompleteLineIdx = i;
        break;
      }
    }

    if (lastCompleteLineIdx < 0 && lines.length > 1) {
      lastCompleteLineIdx = lines.length - 2;
    }

    if (lastCompleteLineIdx < 0) return;

    const completeLines = lines.slice(0, lastCompleteLineIdx + 1);
    this.buffer = lines.slice(lastCompleteLineIdx + 1).join("\n");

    for (const line of completeLines) {
      const filePath = tryFileMarker(line);

      if (filePath) {
        if (this.currentFilePath) {
          const content = this.currentContent.trim();
          if (content) {
            this.files[this.currentFilePath] = content;
            this.onFile(this.currentFilePath, content);
          }
        }
        this.currentFilePath = filePath;
        this.currentContent = "";
      } else if (this.currentFilePath) {
        this.currentContent += line + "\n";
      }
    }
  }

  flush(): void {
    if (this.currentFilePath && this.mode === "marker") {
      const content = (this.currentContent + this.buffer).trim();
      if (content) {
        this.files[this.currentFilePath] = content;
        this.onFile(this.currentFilePath, content);
      }
      this.currentFilePath = null;
      this.currentContent = "";
      this.buffer = "";
    }
  }
}
