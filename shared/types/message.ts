export type MessageRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  model?: string;
  agentId?: string; // provider id (legacy, kept for compat)
  // Pipeline fields
  agentRoleId?: string;
  agentRoleName?: string;
  selectedBy?: string; // "hardcoded" | "user" | "router_llm"
  durationMs?: number;
};

export type StreamingState = {
  isStreaming: boolean;
  currentContent: string;
  error: string | null;
};
