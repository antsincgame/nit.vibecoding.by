export type AgentType = "ollama" | "lm_studio" | "openai_compatible" | "custom";
export type AgentStatus = "online" | "offline" | "checking";

export type AIModel = {
  id: string;
  name: string;
  parameterSize?: string;
};

export type AIAgent = {
  id: string;
  name: string;
  type: AgentType;
  url: string;
  status: AgentStatus;
  models: AIModel[];
  lastChecked?: number;
};

export type AgentSelection = {
  agentId: string;
  modelId: string;
  temperature: number;
};
