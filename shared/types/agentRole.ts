// === Agent Role (stored in Appwrite, later — in-memory seed for now) ===

export type AgentRole = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  providerId: string; // "ollama" | "lm-studio" | "custom"
  modelName: string;
  order: number;
  isActive: boolean;
  isLocked: boolean;
  timeoutMs: number;
  maxRetries: number;
  outputFormat: "freetext" | "json";
  includeNitPrompt: boolean; // true = prepend NIT code generation prompt (for code-producing roles)
  temperature: number;
  createdAt: string;
  updatedAt: string;
};

// === Pipeline types ===

export type AgentStepStatus = "success" | "error" | "timeout" | "cancelled";
export type AgentSelectedBy = "hardcoded" | "user" | "router_llm";

export type AgentStep = {
  order: number;
  agentName: string;
  agentRoleId: string;
  input: string;
  output: string;
  outputParsed?: unknown;
  modelUsed: string;
  providerId: string;
  durationMs: number;
  selectedBy: AgentSelectedBy;
  status: AgentStepStatus;
  timestamp: string;
};

export type AgentMemory = {
  sessionId: string;
  projectId: string;
  steps: AgentStep[];
  createdAt: string;
  lastActivity: string;
};

// === Role selection in UI ===

export const CHAIN_ROLE_ID = "__chain__";
export const AUTO_ROLE_ID = "__auto__";

export type RoleSelection = {
  roleId: string; // role id, CHAIN_ROLE_ID, AUTO_ROLE_ID, or ""
  localContext: string;
};

// === Pipeline SSE events ===

export type PipelineEvent =
  | { type: "session_init"; sessionId: string }
  | { type: "role_selected"; roleId: string; roleName: string; selectedBy: AgentSelectedBy }
  | { type: "step_start"; roleName: string; model: string; provider: string }
  | { type: "text"; text: string }
  | { type: "retry_reset" }  // signals client to discard accumulated text (retry after partial stream)
  | { type: "step_complete"; roleName: string; durationMs: number }
  | { type: "chain_progress"; current: number; total: number }
  | { type: "error"; message: string; roleName?: string }
  | { type: "warning"; message: string }
  | { type: "done" };

// === Pipeline log (for Appwrite, later) ===

export type PipelineLog = {
  id?: string;
  sessionId: string;
  projectId: string;
  agentName: string;
  agentRoleId: string;
  providerId: string;
  modelName: string;
  inputLength: number;
  outputLength: number;
  durationMs: number;
  selectedBy: AgentSelectedBy;
  status: AgentStepStatus | "success" | "error" | "timeout" | "cancelled";
  errorMessage: string;
  retryCount: number;
  timestamp: string;
};

// === Prompt history (for Appwrite, later) ===

export type PromptHistoryEntry = {
  id?: string;
  agentRoleId: string;
  systemPrompt: string;
  version: number;
  createdAt: string;
};
