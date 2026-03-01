import { discoverAgents } from "~/features/agents/service/agentDiscovery";

export async function loader() {
  const agents = await discoverAgents({
    ollamaUrl: process.env.OLLAMA_BASE_URL,
    lmStudioUrl: process.env.LMSTUDIO_BASE_URL,
    customUrl: process.env.CUSTOM_LLM_URL,
    customName: process.env.CUSTOM_LLM_NAME,
    customApiKey: process.env.CUSTOM_LLM_API_KEY,
  });

  return Response.json({ agents });
}
