import type { PipelineLog } from "@shared/types/agentRole";
import { getDb, getMasterDbId, COLLECTIONS, ID } from "~/lib/db/appwrite";
import { logger } from "~/lib/utils/logger";

const SCOPE = "pipeline";

export async function logPipelineStep(log: PipelineLog): Promise<void> {
  try {
    const db = getDb();
    const masterDbId = getMasterDbId();

    await db.createDocument(masterDbId, COLLECTIONS.PIPELINE_LOGS, ID.unique(), {
      session_id: log.sessionId,
      project_id: log.projectId,
      agent_name: log.agentName,
      agent_role_id: log.agentRoleId,
      provider_id: log.providerId,
      model_name: log.modelName,
      input_length: log.inputLength,
      output_length: log.outputLength,
      duration_ms: log.durationMs,
      selected_by: log.selectedBy,
      status: log.status,
      error_message: log.errorMessage,
      retry_count: log.retryCount,
      timestamp: log.timestamp,
    });

    const statusIcon = log.status === "success" ? "\u2713" : log.status === "error" ? "\u2717" : "\u23F8";
    logger.info(
      SCOPE,
      `${statusIcon} [${log.agentName}] ${log.modelName}@${log.providerId} ${log.durationMs}ms` +
        (log.errorMessage ? ` \u2014 ${log.errorMessage}` : ""),
    );
  } catch (err) {
    logger.error(SCOPE, "Failed to log step", err);
  }
}

