export type ProjectType = "react" | "vue" | "html";

export type ProjectVersion = {
  id: string;
  projectId: string;
  code: Record<string, string>;
  prompt: string;
  model: string;
  agentId: string;
  temperature: number;
  versionNumber: number;
  createdAt: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  agentId: string;
  modelUsed: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  description: string;
  type: ProjectType;
};
