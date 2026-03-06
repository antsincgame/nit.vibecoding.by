/**
 * Pipeline Logger
 *
 * Currently logs to in-memory array + console.
 * TODO: Replace with Appwrite when DB phase starts.
 */

import type { PipelineLog } from "@shared/types/agentRole";
import { logger } from "~/lib/utils/logger";

const logs: PipelineLog[] = [];
const MAX_LOGS = 10_000;

export function logPipelineStep(log: PipelineLog): void {
  try {
    logs.push(log);

    // Trim old logs
    if (logs.length > MAX_LOGS) {
      logs.splice(0, logs.length - MAX_LOGS);
    }

    const statusIcon = log.status === "success" ? "✓" : log.status === "error" ? "✗" : "⏸";
    logger.info(
      "pipeline",
      `${statusIcon} [${log.agentName}] ${log.modelName}@${log.providerId} ${log.durationMs}ms` +
        (log.errorMessage ? ` — ${log.errorMessage}` : ""),
    );
  } catch (err) {
    // Logging should never break the pipeline
    console.error("[PipelineLogger] Failed to log step:", err);
  }
}

export function getSessionLogs(sessionId: string): PipelineLog[] {
  return logs
    .filter((l) => l.sessionId === sessionId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function getStats(from: string, to: string) {
  const filtered = logs.filter((l) => l.timestamp >= from && l.timestamp <= to);

  const total = filtered.length;
  const successful = filtered.filter((l) => l.status === "success").length;

  const byAgent: Record<string, { count: number; totalDuration: number; errors: number }> = {};
  const byModel: Record<string, { count: number; totalDuration: number }> = {};

  for (const log of filtered) {
    // By agent
    if (!byAgent[log.agentName]) {
      byAgent[log.agentName] = { count: 0, totalDuration: 0, errors: 0 };
    }
    byAgent[log.agentName]!.count++;
    byAgent[log.agentName]!.totalDuration += log.durationMs;
    if (log.status !== "success") byAgent[log.agentName]!.errors++;

    // By model
    const modelKey = `${log.modelName}@${log.providerId}`;
    if (!byModel[modelKey]) {
      byModel[modelKey] = { count: 0, totalDuration: 0 };
    }
    byModel[modelKey]!.count++;
    byModel[modelKey]!.totalDuration += log.durationMs;
  }

  return {
    totalRequests: total,
    successRate: total > 0 ? successful / total : 0,
    avgDurationMs: total > 0 ? filtered.reduce((s, l) => s + l.durationMs, 0) / total : 0,
    byAgent: Object.fromEntries(
      Object.entries(byAgent).map(([name, data]) => [
        name,
        {
          count: data.count,
          avgDurationMs: data.count > 0 ? data.totalDuration / data.count : 0,
          errorRate: data.count > 0 ? data.errors / data.count : 0,
        },
      ]),
    ),
    byModel: Object.fromEntries(
      Object.entries(byModel).map(([key, data]) => [
        key,
        {
          count: data.count,
          avgDurationMs: data.count > 0 ? data.totalDuration / data.count : 0,
        },
      ]),
    ),
  };
}

export function clearLogs(): void {
  logs.length = 0;
}
