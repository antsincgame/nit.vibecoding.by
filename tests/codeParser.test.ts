import { describe, it, expect } from "vitest";
import {
  looksLikeCode,
  sanitizeVersionCode,
  extractChatText,
  extractGeneratedFileNames,
  detectLanguage,
} from "~/lib/utils/codeParser";

describe("codeParser", () => {
  describe("looksLikeCode", () => {
    it("should return true when text has multiple code indicators", () => {
      const text = "function foo() { return 42; }\nconst x = 1;";
      expect(looksLikeCode(text)).toBe(true);
    });

    it("should return false when text has no code indicators", () => {
      const text = "Hello, this is plain text without code.";
      expect(looksLikeCode(text)).toBe(false);
    });

    it("should return false when text has only one code indicator", () => {
      const text = "Just a single word: function";
      expect(looksLikeCode(text)).toBe(false);
    });

    it("should return true for HTML-like content", () => {
      const text = "<html><body>test</body></html>";
      expect(looksLikeCode(text)).toBe(true);
    });

    it("should return true for CSS-like content", () => {
      const text = "body { margin: 0; display: block; }\n.display { padding: 10px; }";
      expect(looksLikeCode(text)).toBe(true);
    });
  });

  describe("sanitizeVersionCode", () => {
    it("should keep CSS and HTML files as-is", () => {
      const code = {
        "styles.css": "body { margin: 0; }",
        "index.html": "<html></html>",
      };
      const result = sanitizeVersionCode(code);
      expect(result).toEqual(code);
    });

    it("should filter out non-code content from TS/JS files", () => {
      const code = {
        "App.tsx": "Hello world, no code here",
        "styles.css": "body {}",
      };
      const result = sanitizeVersionCode(code);
      expect(result).toHaveProperty("styles.css");
      expect(result["styles.css"]).toBe("body {}");
    });

    it("should keep code-like content in TS files", () => {
      const code = {
        "App.tsx": "export function Foo() { return <div />; }",
      };
      const result = sanitizeVersionCode(code);
      expect(result).toEqual(code);
    });

    it("should return empty object when all entries filtered", () => {
      const code = {
        "a.ts": "plain text",
        "b.ts": "another plain text",
      };
      const result = sanitizeVersionCode(code);
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe("extractChatText", () => {
    it("should remove nitArtifact blocks", () => {
      const raw = "Hello user\n<nitArtifact>code</nitArtifact>";
      expect(extractChatText(raw)).toBe("Hello user");
    });

    it("should remove think blocks", () => {
      const raw = "Answer\n<think>reasoning</think>\nFinal answer";
      expect(extractChatText(raw)).toContain("Answer");
      expect(extractChatText(raw)).toContain("Final answer");
      expect(extractChatText(raw)).not.toContain("reasoning");
    });

    it("should remove code blocks", () => {
      const raw = "Here is code:\n```ts\nconst x = 1;\n```\nDone";
      expect(extractChatText(raw)).not.toContain("const x = 1");
    });

    it("should trim result", () => {
      const raw = "  Hello  ";
      expect(extractChatText(raw)).toBe("Hello");
    });

    it("should return empty string for artifact-only content", () => {
      const raw = "<nitArtifact><file path=\"a.ts\">code</file></nitArtifact>";
      expect(extractChatText(raw)).toBe("");
    });
  });

  describe("extractGeneratedFileNames", () => {
    it("should extract FILE markers", () => {
      const raw = "// === FILE: App.tsx ===\ncontent";
      expect(extractGeneratedFileNames(raw)).toContain("App.tsx");
    });

    it("should extract markdown block filenames", () => {
      const raw = "```ts App.tsx\ncontent\n```";
      expect(extractGeneratedFileNames(raw)).toContain("App.tsx");
    });

    it("should extract filePath from nitArtifact", () => {
      const raw = 'line with filePath="utils.ts"';
      expect(extractGeneratedFileNames(raw)).toContain("utils.ts");
    });

    it("should deduplicate names", () => {
      const raw = "// === FILE: a.ts ===\n// === FILE: a.ts ===";
      expect(extractGeneratedFileNames(raw)).toEqual(["a.ts"]);
    });

    it("should return empty array for empty content", () => {
      expect(extractGeneratedFileNames("")).toEqual([]);
    });
  });

  describe("detectLanguage", () => {
    it("should return typescript for .ts", () => {
      expect(detectLanguage("file.ts")).toBe("typescript");
    });

    it("should return typescriptreact for .tsx", () => {
      expect(detectLanguage("Component.tsx")).toBe("typescriptreact");
    });

    it("should return javascript for .js", () => {
      expect(detectLanguage("script.js")).toBe("javascript");
    });

    it("should return css for .css", () => {
      expect(detectLanguage("styles.css")).toBe("css");
    });

    it("should return html for .html", () => {
      expect(detectLanguage("index.html")).toBe("html");
    });

    it("should return json for .json", () => {
      expect(detectLanguage("config.json")).toBe("json");
    });

    it("should return markdown for .md", () => {
      expect(detectLanguage("readme.md")).toBe("markdown");
    });

    it("should handle unknown extension", () => {
      expect(detectLanguage("file.xyz")).toBe("plaintext");
    });

    it("should handle path with directory", () => {
      expect(detectLanguage("src/components/Button.tsx")).toBe("typescriptreact");
    });
  });
});
