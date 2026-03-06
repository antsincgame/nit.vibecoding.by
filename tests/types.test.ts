import { describe, it, expect } from "vitest";
import { CHAIN_ROLE_ID, AUTO_ROLE_ID } from "@shared/types/agentRole";
import type {
  AgentRole,
  AgentStep,
  AgentMemory,
  RoleSelection,
  PipelineEvent,
  PipelineLog,
  PromptHistoryEntry,
  AgentSelectedBy,
  AgentStepStatus,
} from "@shared/types/agentRole";
import type { ChatMessage } from "@shared/types/message";
import type { AIAgent, AgentType } from "@shared/types/agent";

describe("types consistency", () => {
  it("CHAIN_ROLE_ID and AUTO_ROLE_ID are distinct strings", () => {
    expect(CHAIN_ROLE_ID).toBe("__chain__");
    expect(AUTO_ROLE_ID).toBe("__auto__");
    expect(CHAIN_ROLE_ID).not.toBe(AUTO_ROLE_ID);
  });

  it("AgentRole has required fields", () => {
    const role: AgentRole = {
      id: "test",
      name: "Test",
      description: "Test description",
      systemPrompt: "System prompt",
      providerId: "ollama",
      modelName: "mistral",
      order: 1,
      isActive: true,
      isLocked: false,
      timeoutMs: 60000,
      maxRetries: 2,
      outputFormat: "freetext",
      temperature: 0.7,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
    };
    expect(role.id).toBeTruthy();
    expect(role.outputFormat === "freetext" || role.outputFormat === "json").toBe(true);
  });

  it("ChatMessage supports new pipeline fields", () => {
    const msg: ChatMessage = {
      id: "1",
      role: "assistant",
      content: "response",
      timestamp: Date.now(),
      model: "mistral",
      agentId: "ollama",
      agentRoleId: "role_architect",
      agentRoleName: "Архитектор",
      selectedBy: "hardcoded",
      durationMs: 5000,
    };
    expect(msg.agentRoleName).toBe("Архитектор");
    expect(msg.selectedBy).toBe("hardcoded");
  });

  it("AIAgent no longer has perplexity type", () => {
    const validTypes: AgentType[] = ["ollama", "lm_studio", "openai_compatible", "custom"];
    // @ts-expect-error - "perplexity" should not be assignable
    const invalid: AgentType = "perplexity";
    // Runtime check just in case
    expect(validTypes).not.toContain("perplexity");
  });

  it("PipelineEvent discriminated union covers all types", () => {
    const events: PipelineEvent[] = [
      { type: "session_init", sessionId: "s1" },
      { type: "role_selected", roleId: "r1", roleName: "A", selectedBy: "user" },
      { type: "step_start", roleName: "A", model: "m", provider: "p" },
      { type: "text", text: "hello" },
      { type: "step_complete", roleName: "A", durationMs: 1000 },
      { type: "chain_progress", current: 1, total: 3 },
      { type: "error", message: "oops" },
      { type: "warning", message: "careful" },
      { type: "done" },
    ];
    expect(events.length).toBe(9);
    const types = events.map((e) => e.type);
    expect(new Set(types).size).toBe(9); // all unique
  });
});
