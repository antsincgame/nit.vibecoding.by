import * as prettier from "prettier/standalone";
import * as parserBabel from "prettier/plugins/babel";
import * as parserEstree from "prettier/plugins/estree";
import * as parserHtml from "prettier/plugins/html";
import * as parserCss from "prettier/plugins/postcss";
import * as parserTs from "prettier/plugins/typescript";
import { logger } from "./logger";

const PRETTIER_OPTIONS = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: "all" as const,
  bracketSpacing: true,
  jsxSingleQuote: false,
  arrowParens: "always" as const,
};

const PLUGINS = [parserBabel, parserEstree, parserHtml, parserCss, parserTs];

function getParser(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const parserMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "babel",
    jsx: "babel",
    json: "json",
    css: "css",
    scss: "scss",
    html: "html",
    vue: "vue",
  };
  return parserMap[ext] ?? "babel";
}

export async function formatCode(code: string, filePath: string): Promise<string> {
  try {
    const parser = getParser(filePath);
    return await prettier.format(code, {
      ...PRETTIER_OPTIONS,
      parser,
      plugins: PLUGINS,
    });
  } catch (err) {
    logger.warn("formatCode", `Prettier failed for ${filePath}, returning original`, err);
    return code;
  }
}

export async function formatAllFiles(
  files: Record<string, string>,
): Promise<Record<string, string>> {
  const formatted: Record<string, string> = {};

  const entries = Object.entries(files);
  const results = await Promise.allSettled(
    entries.map(async ([path, content]) => ({
      path,
      content: await formatCode(content, path),
    })),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      formatted[result.value.path] = result.value.content;
    }
  }

  return formatted;
}
