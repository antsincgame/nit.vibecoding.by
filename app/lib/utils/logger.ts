type LogLevel = "warn" | "error";

function formatMessage(level: LogLevel, scope: string, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${scope}]`;
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
  return `${prefix} ${message}${metaStr}`;
}

export const logger = {
  warn(scope: string, message: string, meta?: unknown) {
    console.warn(formatMessage("warn", scope, message, meta));
  },
  error(scope: string, message: string, meta?: unknown) {
    console.error(formatMessage("error", scope, message, meta));
  },
} as const;
