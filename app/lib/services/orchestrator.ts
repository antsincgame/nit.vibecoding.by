/**
 * Orchestrator Service
 *
 * Makes intelligent decisions between pipeline steps:
 * - Validates step outputs before passing to next agent
 * - Skips unnecessary steps based on request analysis
 * - Sends back for rework if quality check fails
 * - Limits retry loops to prevent infinite cycles
 *
 * Works with LLM to decide flow, not hardcoded rules.
 */

import type { AgentRole, AgentMemory, AgentStep, PipelineEvent } from "@shared/types/agentRole";
import { getAllRoles, getRoleById } from "./roleService";
import { executeStepStreaming } from "./agentPipeline";
import { LLMManager } from "~/lib/llm/manager";
import { generateText } from "ai";
import { logger } from "~/lib/utils/logger";

const ORCHESTRATOR_PROVIDER = process.env.ROUTER_PROVIDER_ID ?? "ollama";
const ORCHESTRATOR_MODEL = process.env.ROUTER_MODEL_NAME ?? "mistral";
const MAX_FIX_CYCLES = 2; // max Tester→Coder fix loops

// ─── Step validation ─────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  issues: string[];
}

function validateArchitectOutput(output: string): ValidationResult {
  const issues: string[] = [];

  // Must contain JSON
  const hasJson = output.includes("{") && output.includes("}");
  if (!hasJson) {
    issues.push("Нет JSON-структуры в ответе Архитектора");
    return { valid: false, issues };
  }

  // Try to parse
  let parsed: unknown;
  try {
    // Direct parse
    parsed = JSON.parse(output);
  } catch {
    // Try extract from markdown
    const match = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match?.[1]) {
      try { parsed = JSON.parse(match[1]); } catch {}
    }
    // Try brace extraction
    if (!parsed) {
      const first = output.indexOf("{");
      const last = output.lastIndexOf("}");
      if (first !== -1 && last > first) {
        try { parsed = JSON.parse(output.slice(first, last + 1)); } catch {}
      }
    }
  }

  if (!parsed || typeof parsed !== "object") {
    issues.push("JSON не удалось распарсить");
    return { valid: false, issues };
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.pages && !obj.project_name) {
    issues.push("JSON не содержит pages или project_name");
  }

  return { valid: issues.length === 0, issues };
}

function validateCoderOutput(output: string): ValidationResult {
  const issues: string[] = [];

  const hasArtifact = output.includes("<nitArtifact") || output.includes("<nitAction");
  if (!hasArtifact) {
    // Check fallback format
    const hasFallback = output.includes("// === FILE:");
    if (!hasFallback) {
      issues.push("Кодер не сгенерировал код в формате nitArtifact");
    }
  }

  // Check for truncation signals
  if (output.includes("...") && output.length < 200) {
    issues.push("Код выглядит обрезанным");
  }

  return { valid: issues.length === 0, issues };
}

function validateTesterOutput(output: string): ValidationResult {
  const lower = output.toLowerCase();

  const hasVerdict = lower.includes("pass") || lower.includes("fail")
    || lower.includes("критическ") || lower.includes("ошибк");

  return {
    valid: hasVerdict,
    issues: hasVerdict ? [] : ["Тестировщик не дал итогового вердикта"],
  };
}

function validateStepOutput(role: AgentRole, output: string): ValidationResult {
  if (!output.trim()) {
    return { valid: false, issues: ["Пустой ответ"] };
  }

  switch (role.id) {
    case "role_architect":
      return validateArchitectOutput(output);
    case "role_coder":
      return validateCoderOutput(output);
    case "role_tester":
      return validateTesterOutput(output);
    default:
      // For custom/unknown roles — accept any non-empty output
      return { valid: true, issues: [] };
  }
}

// ─── Plan which steps are needed ─────────────────────────

export type OrchestratorPlan = {
  steps: AgentRole[];
  reasoning: string;
  skipReasons: Record<string, string>; // roleId → why skipped
};

export async function planPipeline(
  memory: AgentMemory,
  userMessage: string,
): Promise<OrchestratorPlan> {
  const activeRoles = getAllRoles(true);
  if (activeRoles.length === 0) {
    return { steps: [], reasoning: "Нет активных ролей", skipReasons: {} };
  }

  const isNewSession = memory.steps.length === 0;

  // New session → always full chain (user expects complete site)
  if (isNewSession) {
    return {
      steps: activeRoles,
      reasoning: "Новая сессия — полная цепочка для создания сайта с нуля",
      skipReasons: {},
    };
  }

  // Existing session → ask LLM which agents are needed
  try {
    const manager = LLMManager.getInstance(process.env as Record<string, string>);
    const provider = manager.getProvider(ORCHESTRATOR_PROVIDER);
    if (!provider) {
      return { steps: activeRoles, reasoning: "Провайдер оркестратора недоступен — полная цепочка", skipReasons: {} };
    }

    const model = provider.getModelInstance({
      model: ORCHESTRATOR_MODEL,
      serverEnv: process.env as Record<string, string>,
    });

    const lastSteps = memory.steps.slice(-3).map(
      (s) => `[${s.agentName}]: ${s.output.slice(0, 150)}...`,
    ).join("\n");

    const roleList = activeRoles.map((r) => `- ${r.name} (${r.id}): ${r.description}`).join("\n");

    const { text } = await generateText({
      model,
      prompt: `Ты оркестратор агентов. Определи, какие агенты нужны для запроса.

Доступные агенты:
${roleList}

Предыдущие шаги:
${lastSteps}

Запрос пользователя: "${userMessage}"

Правила:
- Если запрос про структуру/дизайн → нужен Архитектор + Кодер
- Если запрос про текст → нужен Копирайтер + Кодер
- Если запрос про баг/исправление → нужен только Кодер
- Если запрос про проверку → нужен только Тестировщик
- Для создания нового сайта → все агенты
- Кодер нужен ВСЕГДА, если результат должен быть рабочим кодом

Ответь JSON (только JSON, без пояснений):
{"needed": ["role_id1", "role_id2"], "reasoning": "краткое пояснение"}`,
      maxTokens: 200,
      temperature: 0.1,
    });

    // Parse response
    let parsed: { needed?: string[]; reasoning?: string } = {};
    try {
      const clean = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      // Try brace extraction
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first !== -1 && last > first) {
        try { parsed = JSON.parse(text.slice(first, last + 1)); } catch {}
      }
    }

    if (parsed.needed && Array.isArray(parsed.needed) && parsed.needed.length > 0) {
      const steps: AgentRole[] = [];
      const skipReasons: Record<string, string> = {};

      for (const role of activeRoles) {
        if (parsed.needed.includes(role.id)) {
          steps.push(role);
        } else {
          skipReasons[role.id] = `Не требуется для данного запроса`;
        }
      }

      // Safety: always include Кодер if any step generates structure/content
      const hasCoder = steps.some((r) => r.id === "role_coder");
      const hasContentSteps = steps.some((r) => r.id === "role_architect" || r.id === "role_copywriter");
      if (hasContentSteps && !hasCoder) {
        const coder = getRoleById("role_coder");
        if (coder && coder.isActive) {
          steps.push(coder);
          steps.sort((a, b) => a.order - b.order);
          delete skipReasons["role_coder"];
        }
      }

      if (steps.length > 0) {
        return {
          steps,
          reasoning: parsed.reasoning ?? "LLM-оркестратор выбрал шаги",
          skipReasons,
        };
      }
    }
  } catch (err) {
    logger.warn("orchestrator", "Planning failed, using full chain", err);
  }

  // Fallback: full chain
  return {
    steps: activeRoles,
    reasoning: "Не удалось определить нужные шаги — полная цепочка",
    skipReasons: {},
  };
}

// ─── Orchestrated chain execution ────────────────────────

export async function* executeOrchestrated(
  memory: AgentMemory,
  userMessage: string,
  localContext: string,
  projectType: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<PipelineEvent> {
  // 1. Plan which steps are needed
  const plan = await planPipeline(memory, userMessage);

  if (plan.steps.length === 0) {
    yield { type: "error", message: "Нет активных ролей для выполнения." };
    return;
  }

  // Notify client about plan
  yield {
    type: "warning",
    message: `Оркестратор: ${plan.reasoning}. Шаги: ${plan.steps.map((r) => r.name).join(" → ")}`,
  };

  const total = plan.steps.length;
  let fixCycleCount = 0;
  let i = 0;

  while (i < plan.steps.length) {
    const role = plan.steps[i]!;

    if (abortSignal?.aborted) {
      yield { type: "error", message: "Отменено пользователем" };
      return;
    }

    const selectedBy = i === 0 && role.isLocked ? "hardcoded" as const : "user" as const;

    yield { type: "role_selected", roleId: role.id, roleName: role.name, selectedBy };
    yield { type: "step_start", roleName: role.name, model: role.modelName, provider: role.providerId };
    yield { type: "chain_progress", current: i + 1, total: plan.steps.length };

    // 2. Execute step
    let stepOutput = "";
    let stepSucceeded = false;

    const stepGen = executeStepStreaming(
      role, memory, userMessage,
      i === 0 ? localContext : "",
      projectType, selectedBy, abortSignal,
    );

    for await (const event of stepGen) {
      yield event;
      if (event.type === "text") stepOutput += event.text;
      if (event.type === "step_complete") stepSucceeded = true;
      if (event.type === "error") return;
    }

    if (!stepSucceeded) {
      yield { type: "error", message: `${role.name}: шаг не завершён`, roleName: role.name };
      return;
    }

    // 3. Validate output
    const validation = validateStepOutput(role, stepOutput);

    if (!validation.valid) {
      const issueList = validation.issues.join("; ");
      yield { type: "warning", message: `⚠️ ${role.name}: ${issueList}` };

      // For non-critical issues, continue anyway
      logger.warn("orchestrator", `${role.name} validation issues: ${issueList}`);
    }

    // 4. Tester→Coder fix cycle
    if (role.id === "role_tester" && fixCycleCount < MAX_FIX_CYCLES) {
      const hasCritical = stepOutput.toLowerCase().includes("критическ")
        || stepOutput.toLowerCase().includes("fail")
        || (stepOutput.toLowerCase().includes("ошибк") && !stepOutput.toLowerCase().includes("нет ошибок"));

      if (hasCritical) {
        fixCycleCount++;
        yield {
          type: "warning",
          message: `🔄 Тестировщик нашёл критические ошибки. Отправляю Кодеру на исправление (цикл ${fixCycleCount}/${MAX_FIX_CYCLES})...`,
        };

        // Insert Coder + Tester back into pipeline
        const coder = getRoleById("role_coder");
        const tester = getRoleById("role_tester");
        if (coder && coder.isActive && tester && tester.isActive) {
          // Don't increment i — we're inserting steps
          plan.steps.splice(i + 1, 0, coder, tester);
        }
      }
    }

    i++;
  }

  yield { type: "done" };
}
