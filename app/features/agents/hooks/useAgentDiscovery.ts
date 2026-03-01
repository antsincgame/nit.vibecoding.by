import { useCallback, useEffect, useRef } from "react";
import { useAgentStore } from "~/lib/stores/agentStore";
import type { AIAgent } from "@shared/types/agent";

const POLL_INTERVAL = 30_000;

export function useAgentDiscovery() {
  const { setAgents, setDiscovering, setError } = useAgentStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const discover = useCallback(async () => {
    setDiscovering(true);
    setError(null);

    try {
      const response = await fetch("/api/agents");
      if (!response.ok) throw new Error("Failed to discover agents");

      const data = (await response.json()) as { agents: AIAgent[] };
      setAgents(data.agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }, [setAgents, setDiscovering, setError]);

  useEffect(() => {
    discover();

    intervalRef.current = setInterval(discover, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [discover]);

  return { refresh: discover };
}
