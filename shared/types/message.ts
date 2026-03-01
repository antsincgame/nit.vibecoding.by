export type MessageRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  model?: string;
  agentId?: string;
};

export type StreamingState = {
  isStreaming: boolean;
  currentContent: string;
  error: string | null;
};
