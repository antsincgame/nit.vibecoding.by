const MAX_CONTEXT_CHARS = 10_000;

export type ParseResult = {
  text: string;
  truncated: boolean;
  error?: string;
};

export async function parseContextFile(file: File): Promise<ParseResult> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";

  try {
    let rawText: string;

    if (ext === "txt" || ext === "md" || ext === "json") {
      rawText = await readTextFile(file);
    } else if (ext === "pdf") {
      rawText = await parsePdf(file);
    } else if (ext === "docx") {
      rawText = await parseDocx(file);
    } else {
      return { text: "", truncated: false, error: `Неподдерживаемый формат: .${ext}` };
    }

    const truncated = rawText.length > MAX_CONTEXT_CHARS;
    const text = truncated ? rawText.slice(0, MAX_CONTEXT_CHARS) : rawText;

    return { text, truncated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка чтения файла";
    return { text: "", truncated: false, error: msg };
  }
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) ?? "");
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsText(file, "UTF-8");
  });
}

async function parsePdf(file: File): Promise<string> {
  const { getDocument } = await import("pdfjs-dist");

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const parts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(pageText);
  }

  return parts.join("\n\n");
}

async function parseDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
