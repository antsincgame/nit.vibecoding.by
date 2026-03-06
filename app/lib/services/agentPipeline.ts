/**
 * Agent Pipeline Service
 *
 * Manages multi-agent execution: memory, prompt assembly, chain execution.
 *
 * DESIGN DECISIONS:
 * - Single role: streams token-by-token via executeStepStreaming
 * - Chain: each step streams token-by-token, output saved to memory for next step
 * - Retry: signals client to reset text, preventing duplicate/corrupted output
 * - Memory: in-process RAM with TTL cleanup
 */

import type {
  AgentRole,
  AgentMemory,
  AgentStep,
  AgentSelectedBy,
  PipelineEvent,
} from "@shared/types/agentRole";
import { CHAIN_ROLE_ID, AUTO_ROLE_ID } from "@shared/types/agentRole";
import { getAllRoles, getRoleById, getLockedRole } from "./roleService";
import { routeToAgent } from "./agentRouter";
import { logPipelineStep } from "./pipelineLogger";
import { buildSystemPrompt } from "~/lib/server/llm/prompts";
import { LLMManager } from "~/lib/llm/manager";
import { streamText as aiStreamText } from "ai";
import { logger } from "~/lib/utils/logger";

// ─── Session Memory (in-process RAM) ─────────────────────

const sessions = new Map<string, AgentMemory>();

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const CLEANUP_INTERVAL = 15 * 60 * 1000;
const MAX_CHAIN_LENGTH = 10;

setInterval(() => {
  const now = Date.now();
  for (const [id, memory] of sessions) {
    if (now - new Date(memory.lastActivity).getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, CLEANUP_INTERVAL);

// ─── Memory management ──────────────────────────────────

export function getOrCreateSession(sessionId: string, projectId: string): AgentMemory {
  let memory = sessions.get(sessionId);
  if (!memory) {
    memory = {
      sessionId,
      projectId,
      steps: [],
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
    sessions.set(sessionId, memory);
  }
  return memory;
}

export function getSession(sessionId: string): AgentMemory | undefined {
  return sessions.get(sessionId);
}

// ─── Role selection logic ────────────────────────────────

export async function selectRole(
  sessionId: string,
  roleId: string,
  userMessage: string,
  forceRole = false,
): Promise<{ role: AgentRole; selectedBy: AgentSelectedBy }> {
  const memory = sessions.get(sessionId);
  const isNewSession = !memory || memory.steps.length === 0;

  // Rule 0: forceRole bypasses new-session Architect lock (used by PromptTester)
  if (forceRole && roleId && roleId !== CHAIN_ROLE_ID && roleId !== AUTO_ROLE_ID) {
    const role = getRoleById(roleId);
    if (role && role.isActive) return { role, selectedBy: "user" };
  }

  // Rule 1: New session → always Architect
  if (isNewSession) {
    const architect = getLockedRole();
    if (architect) return { role: architect, selectedBy: "hardcoded" };
    const first = getAllRoles(true)[0];
    if (!first) throw new Error("Нет активных ролей. Создайте роли в настройках.");
    return { role: first, selectedBy: "hardcoded" };
  }

  // Session exists with steps — memory is guaranteed non-null

  // Rule 2: User explicitly selected a role
  if (roleId && roleId !== CHAIN_ROLE_ID && roleId !== AUTO_ROLE_ID) {
    const role = getRoleById(roleId);
    if (role && role.isActive) return { role, selectedBy: "user" };
    logger.warn("selectRole", `Role "${roleId}" not found/inactive, falling back to auto`);
  }

  // Rule 3: Auto-select via LLM router
  const activeRoles = getAllRoles(true);
  if (activeRoles.length === 0) throw new Error("Нет активных ролей.");
  const role = await routeToAgent(activeRoles, memory!, userMessage);
  return { role, selectedBy: "router_llm" };
}

// ─── Prompt assembly ─────────────────────────────────────

export function buildAgentPrompt(
  role: AgentRole,
  memory: AgentMemory,
  userMessage: string,
  localContext: string,
  projectType: string,
): { system: string; user: string } {
  // Only include NIT code generation prompt for roles that produce code (nitArtifact format).
  // Roles like Architect (JSON), Copywriter (text), Tester (review) should NOT get NIT rules
  // because they conflict with the role's own output format instructions.
  let system: string;

  if (role.includeNitPrompt) {
    const nitSystemPrompt = buildSystemPrompt(projectType);
    system = `${nitSystemPrompt}\n\n=== РОЛЬ АГЕНТА: ${role.name} ===\n${role.systemPrompt}`;
  } else {
    system = `Ты агент веб-студии.\n\n=== РОЛЬ: ${role.name} ===\n${role.systemPrompt}`;
  }

  const parts: string[] = [];

  if (memory.steps.length > 0) {
    const context = memory.steps
      .map((s) => `[${s.agentName} | ${s.timestamp}]:\n${s.output}`)
      .join("\n\n---\n\n");
    parts.push(`== КОНТЕКСТ ОТ ПРЕДЫДУЩИХ АГЕНТОВ ==\n${context}`);
  }

  parts.push(`== ЗАПРОС ПОЛЬЗОВАТЕЛЯ ==\n${userMessage}`);

  if (localContext.trim()) {
    parts.push(`== ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ ==\n${localContext}`);
  }

  return { system, user: parts.join("\n\n") };
}

// ─── Model instance helper ───────────────────────────────

function getModelInstance(role: AgentRole) {
  const manager = LLMManager.getInstance(process.env as Record<string, string>);
  const provider = manager.getProvider(role.providerId);

  if (!provider) {
    throw new Error(
      `Провайдер "${role.providerId}" не найден для роли "${role.name}". ` +
      `Доступные: ${manager.getAllProviders().map((p) => p.name).join(", ")}`,
    );
  }

  return provider.getModelInstance({
    model: role.modelName,
    serverEnv: process.env as Record<string, string>,
  });
}

// ─── Single step: streaming with safe retry ──────────────
//
// On retry: yields a "retry_reset" warning so the client knows to
// discard partial text. This prevents the duplicate text bug.

export async function* executeStepStreaming(
  role: AgentRole,
  memory: AgentMemory,
  userMessage: string,
  localContext: string,
  projectType: string,
  selectedBy: AgentSelectedBy,
  abortSignal?: AbortSignal,
): AsyncGenerator<PipelineEvent> {
  const { system, user } = buildAgentPrompt(role, memory, userMessage, localContext, projectType);

  let modelInstance: ReturnType<typeof getModelInstance>;
  try {
    modelInstance = getModelInstance(role);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Model init failed";
    yield { type: "error", message: msg, roleName: role.name };
    logErrorStep(memory, role, user, selectedBy, msg, 0);
    return;
  }

  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount <= role.maxRetries) {
    if (abortSignal?.aborted) {
      yield { type: "error", message: "Отменено" };
      logErrorStep(memory, role, user, selectedBy, "Cancelled", retryCount);
      return;
    }

    // Signal retry to client — must reset accumulated text
    if (retryCount > 0) {
      yield { type: "retry_reset" as const };
      yield { type: "warning", message: `Повтор ${retryCount}/${role.maxRetries}...` };
    }

    try {
      const result = aiStreamText({
        model: modelInstance,
        system,
        prompt: user,
        temperature: role.temperature,
        maxTokens: 8192,
        abortSignal,
      });

      let accumulated = "";

      for await (const chunk of result.textStream) {
        accumulated += chunk;
        yield { type: "text", text: chunk };
      }

      const durationMs = Date.now() - startTime;

      if (!accumulated.trim()) {
        const errMsg = "Модель вернула пустой ответ. Проверьте, что модель загружена.";
        yield { type: "error", message: errMsg, roleName: role.name };
        logErrorStep(memory, role, user, selectedBy, errMsg, retryCount);
        return;
      }

      // Success — save to memory and log
      const step: AgentStep = {
        order: role.order,
        agentName: role.name,
        agentRoleId: role.id,
        input: user,
        output: accumulated,
        outputParsed: role.outputFormat === "json" ? tryParseJSON(accumulated) : undefined,
        modelUsed: role.modelName,
        providerId: role.providerId,
        durationMs,
        selectedBy,
        status: "success",
        timestamp: new Date().toISOString(),
      };
      memory.steps.push(step);
      memory.lastActivity = step.timestamp;

      logPipelineStep({
        sessionId: memory.sessionId,
        projectId: memory.projectId,
        agentName: role.name,
        agentRoleId: role.id,
        providerId: role.providerId,
        modelName: role.modelName,
        inputLength: user.length,
        outputLength: accumulated.length,
        durationMs,
        selectedBy,
        status: "success",
        errorMessage: "",
        retryCount,
        timestamp: step.timestamp,
      });

      yield { type: "step_complete", roleName: role.name, durationMs };
      return;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (error.name === "AbortError") {
        logErrorStep(memory, role, user, selectedBy, "Cancelled", retryCount);
        yield { type: "error", message: "Отменено" };
        return;
      }

      logger.warn("pipeline", `${role.name} attempt ${retryCount + 1} failed: ${error.message}`);
      retryCount++;

      if (retryCount <= role.maxRetries) {
        const backoff = Math.min(Math.pow(2, retryCount) * 1000, 10_000);
        await new Promise((r) => setTimeout(r, backoff));
        // Continue loop for next attempt
      } else {
        const errMsg = `${role.name}: ${error.message} (${retryCount} попыток исчерпано)`;
        logErrorStep(memory, role, user, selectedBy, errMsg, retryCount);
        yield { type: "error", message: errMsg, roleName: role.name };
        return;
      }
    }
  }
}

// ─── Chain execution: each step streams to client ────────

export async function* executeChain(
  memory: AgentMemory,
  userMessage: string,
  localContext: string,
  projectType: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<PipelineEvent> {
  const activeRoles = getAllRoles(true);

  if (activeRoles.length === 0) {
    yield { type: "error", message: "Нет активных ролей." };
    return;
  }
  if (activeRoles.length > MAX_CHAIN_LENGTH) {
    yield { type: "error", message: `Слишком много ролей (${activeRoles.length}). Максимум: ${MAX_CHAIN_LENGTH}` };
    return;
  }

  const total = activeRoles.length;

  for (let i = 0; i < total; i++) {
    const role = activeRoles[i]!;

    if (abortSignal?.aborted) {
      yield { type: "error", message: "Цепочка отменена" };
      return;
    }

    const selectedBy: AgentSelectedBy = i === 0 && role.isLocked ? "hardcoded" : "user";

    yield { type: "role_selected", roleId: role.id, roleName: role.name, selectedBy };
    yield { type: "step_start", roleName: role.name, model: role.modelName, provider: role.providerId };
    yield { type: "chain_progress", current: i + 1, total };

    // Stream this step — forward all events to client
    let stepSucceeded = false;

    const stepGen = executeStepStreaming(
      role,
      memory,
      userMessage,
      i === 0 ? localContext : "",
      projectType,
      selectedBy,
      abortSignal,
    );

    for await (const event of stepGen) {
      yield event;

      if (event.type === "step_complete") stepSucceeded = true;
      if (event.type === "error") return; // Stop chain on error
    }

    if (!stepSucceeded) {
      yield { type: "error", message: `${role.name}: шаг завершился без результата`, roleName: role.name };
      return;
    }
  }

  yield { type: "done" };
}

// ─── Helpers ─────────────────────────────────────────────

function logErrorStep(
  memory: AgentMemory,
  role: AgentRole,
  input: string,
  selectedBy: AgentSelectedBy,
  errorMessage: string,
  retryCount: number,
) {
  const now = new Date().toISOString();
  memory.steps.push({
    order: role.order,
    agentName: role.name,
    agentRoleId: role.id,
    input,
    output: "",
    modelUsed: role.modelName,
    providerId: role.providerId,
    durationMs: 0,
    selectedBy,
    status: "error",
    timestamp: now,
  });
  memory.lastActivity = now;

  logPipelineStep({
    sessionId: memory.sessionId,
    projectId: memory.projectId,
    agentName: role.name,
    agentRoleId: role.id,
    providerId: role.providerId,
    modelName: role.modelName,
    inputLength: input.length,
    outputLength: 0,
    durationMs: 0,
    selectedBy,
    status: "error",
    errorMessage,
    retryCount,
    timestamp: now,
  });
}

function tryParseJSON(text: string): unknown | undefined {
  try { return JSON.parse(text); } catch {}

  const mdMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (mdMatch?.[1]) {
    try { return JSON.parse(mdMatch[1]); } catch {}
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch {}
  }

  return undefined;
}
