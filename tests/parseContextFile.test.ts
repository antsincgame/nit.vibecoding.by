/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDocument = vi.fn();
const mockExtractRawText = vi.fn();

vi.mock("pdfjs-dist", () => ({
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
}));
vi.mock("mammoth", () => ({
  extractRawText: (...args: unknown[]) => mockExtractRawText(...args),
}));

import { parseContextFile } from "~/lib/utils/parseContextFile";

describe("parseContextFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("text formats (txt, md, json)", () => {
    it("parses .txt file", async () => {
      const content = "Hello world from text file";
      const file = new File([content], "test.txt", { type: "text/plain" });
      const result = await parseContextFile(file);
      expect(result.text).toBe(content);
      expect(result.truncated).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("parses .md file", async () => {
      const content = "# Title\n\nParagraph with **bold**.";
      const file = new File([content], "readme.md", { type: "text/markdown" });
      const result = await parseContextFile(file);
      expect(result.text).toBe(content);
      expect(result.truncated).toBe(false);
    });

    it("parses .json file", async () => {
      const content = '{"key": "value"}';
      const file = new File([content], "data.json", { type: "application/json" });
      const result = await parseContextFile(file);
      expect(result.text).toBe(content);
      expect(result.truncated).toBe(false);
    });

    it("truncates text over 10_000 chars", async () => {
      const long = "x".repeat(15_000);
      const file = new File([long], "big.txt", { type: "text/plain" });
      const result = await parseContextFile(file);
      expect(result.text.length).toBe(10_000);
      expect(result.truncated).toBe(true);
    });
  });

  describe("unsupported format", () => {
    it("returns error for .xyz", async () => {
      const file = new File(["data"], "file.xyz", { type: "application/octet-stream" });
      const result = await parseContextFile(file);
      expect(result.text).toBe("");
      expect(result.truncated).toBe(false);
      expect(result.error).toContain("Неподдерживаемый формат");
      expect(result.error).toContain("xyz");
    });
  });

  describe("PDF", () => {
    it("extracts text from PDF", async () => {
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: "Page 1 text" }, { str: " more" }],
        }),
      };
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn().mockResolvedValue(mockPage),
        }),
      });

      const file = new File([new ArrayBuffer(100)], "doc.pdf", { type: "application/pdf" });
      const result = await parseContextFile(file);
      expect(result.text).toContain("Page 1 text");
      expect(result.text).toContain("more");
      expect(result.truncated).toBe(false);
    });
  });

  describe("DOCX", () => {
    it("extracts text from DOCX", async () => {
      mockExtractRawText.mockResolvedValue({ value: "Docx content here" });

      const file = new File([new ArrayBuffer(200)], "doc.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const result = await parseContextFile(file);
      expect(result.text).toContain("Docx content");
      expect(result.truncated).toBe(false);
    });
  });

  describe("error handling", () => {
    it("returns error when PDF parsing throws", async () => {
      mockGetDocument.mockReturnValue({
        promise: Promise.reject(new Error("Invalid PDF")),
      });

      const file = new File([new ArrayBuffer(10)], "bad.pdf", { type: "application/pdf" });
      const result = await parseContextFile(file);
      expect(result.text).toBe("");
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Invalid PDF");
    });
  });
});
