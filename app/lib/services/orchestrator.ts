/**
 * Orchestrator Service
 *
 * Intelligent pipeline decision engine:
 * - Plans which agents are needed (LLM-based)
 * - Validates outputs between steps
 * - Tester→Coder fix cycles with explicit fix instructions
 * - Limits cycles to prevent infinite loops
 */

import type { AgentRole, AgentMemory, PipelineEvent } from "@shared/types/agentRole";
import { getAllRoles, getRoleById } from "./roleService";
import { executeStepStreaming } from "./agentPipeline";
import { LLMManager } from "~/lib/llm/manager";
import { generateText } from "ai";
import { logger } from "~/lib/utils/logger";

const ORCHESTRATOR_PROVIDER = process.env.ROUTER_PROVIDER_ID ?? "ollama";
const ORCHESTRATOR_MODEL = process.env.ROUTER_MODEL_NAME ?? "mistral";
const MAX_FIX_CYCLES = 2;

// ─── Validation ──────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  issues: string[];
}

function validateArchitectOutput(output: string): ValidationResult {
  const issues: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    const match = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match?.[1]) {
      try { parsed = JSON.parse(match[1]); } catch {}
    }
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
  const hasFallback = output.includes("// === FILE:");

  if (!hasArtifact && !hasFallback) {
    issues.push("Кодер не сгенерировал код в формате nitArtifact");
  }

  // Truncation: only flag if output is suspiciously short AND ends mid-tag
  if (output.length < 100 && !output.includes("</nitArtifact>") && !output.includes("</nitAction>")) {
    issues.push("Код выглядит обрезанным");
  }

  return { valid: issues.length === 0, issues };
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
    default:
      return { valid: true, issues: [] };
  }
}

// ─── Tester critical error detection ─────────────────────

function testerFoundCriticalErrors(output: string): boolean {
  const lower = output.toLowerCase();

  // Explicit PASS → no errors
  if (lower.includes("итого: pass") || lower.includes("итого:pass")) return false;

  // Explicit negative patterns → no errors
  const noErrorPatterns = [
    "нет ошибок", "без ошибок", "ошибок не обнаружено", "ошибок нет",
    "критических ошибок нет", "критических нет", "0 критических",
  ];
  for (const pat of noErrorPatterns) {
    if (lower.includes(pat)) return false;
  }

  // Explicit FAIL → errors
  if (lower.includes("итого: fail") || lower.includes("итого:fail")) return true;

  // Critical error markers
  const criticalPatterns = [
    "критическ", "блокирующ", "critical",
  ];
  for (const pat of criticalPatterns) {
    if (lower.includes(pat)) return true;
  }

  return false;
}

// ─── Planning ────────────────────────────────────────────

export type OrchestratorPlan = {
  steps: AgentRole[];
  reasoning: string;
  skipReasons: Record<string, string>;
};

export type OrchestratorLLMOptions = {
  providerId?: string;
  modelName?: string;
};

export async function planPipeline(
  memory: AgentMemory,
  userMessage: string,
  llmOptions?: OrchestratorLLMOptions,
): Promise<OrchestratorPlan> {
  const activeRoles = await getAllRoles(true);
  if (activeRoles.length === 0) {
    return { steps: [], reasoning: "Нет активных ролей", skipReasons: {} };
  }

  // New session → always full chain
  if (memory.steps.length === 0) {
    return {
      steps: activeRoles,
      reasoning: "Новая сессия — полная цепочка для создания сайта с нуля",
      skipReasons: {},
    };
  }

  // Existing session → ask LLM
  const providerId = llmOptions?.providerId ?? ORCHESTRATOR_PROVIDER;
  const modelName = llmOptions?.modelName ?? ORCHESTRATOR_MODEL;

  try {
    const manager = LLMManager.getInstance(process.env as Record<string, string>);
    const provider = manager.getProvider(providerId);
    if (!provider) {
      return { steps: activeRoles, reasoning: "Провайдер оркестратора недоступен — полная цепочка", skipReasons: {} };
    }

    const model = provider.getModelInstance({
      model: modelName,
      serverEnv: process.env as Record<string, string>,
    });

    const lastSteps = memory.steps.slice(-3)
      .map((s) => `[${s.agentName}]: ${s.output.slice(0, 150)}...`)
      .join("\n");

    const roleList = activeRoles
      .map((r) => `- ${r.name} (${r.id}): ${r.description}`)
      .join("\n");

    const { text } = await generateText({
      model,
      prompt: `Ты оркестратор агентов. Определи какие агенты нужны.

Агенты:
${roleList}

Предыдущие шаги:
${lastSteps}

Запрос: "${userMessage}"

Правила:
- анализ/уточнение требований → Аналитик
- структура/дизайн → Архитектор + Кодер
- визуальный стиль/цвета/типографика → Дизайнер + Кодер
- текст/контент → Копирайтер + Кодер
- баг/исправление кода → только Кодер
- проверка → только Тестировщик
- Кодер нужен ВСЕГДА если нужен рабочий код

JSON (без пояснений):
{"needed":["role_id1","role_id2"],"reasoning":"пояснение"}`,
      maxTokens: 200,
      temperature: 0.1,
    });

    let parsed: { needed?: string[]; reasoning?: string } = {};
    try {
      const clean = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
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
          skipReasons[role.id] = "Не требуется для данного запроса";
        }
      }

      // Safety: always include Кодер if content-producing steps present
      const hasCoder = steps.some((r) => r.id === "role_coder");
      const hasContentSteps = steps.some((r) =>
        r.id === "role_architect" || r.id === "role_copywriter" || r.id === "role_designer",
      );
      if (hasContentSteps && !hasCoder) {
        const coder = await getRoleById("role_coder");
        if (coder?.isActive) {
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

  return {
    steps: activeRoles,
    reasoning: "Не удалось определить нужные шаги — полная цепочка",
    skipReasons: {},
  };
}

// ─── Orchestrated execution ──────────────────────────────

export async function* executeOrchestrated(
  memory: AgentMemory,
  userMessage: string,
  localContext: string,
  projectType: string,
  abortSignal?: AbortSignal,
  llmOptions?: OrchestratorLLMOptions,
): AsyncGenerator<PipelineEvent> {
  const plan = await planPipeline(memory, userMessage, llmOptions);

  if (plan.steps.length === 0) {
    yield { type: "error", message: "Нет активных ролей для выполнения." };
    return;
  }

  yield {
    type: "warning",
    message: `Оркестратор: ${plan.reasoning}. Шаги: ${plan.steps.map((r) => r.name).join(" → ")}`,
  };

  // Use a queue instead of mutating array indices — cleaner for fix cycles
  const queue: AgentRole[] = [...plan.steps];
  let completedCount = 0;
  let fixCycleCount = 0;

  while (queue.length > 0) {
    const role = queue.shift()!;

    if (abortSignal?.aborted) {
      yield { type: "error", message: "Отменено пользователем" };
      return;
    }

    completedCount++;
    const totalEstimate = completedCount + queue.length;
    const selectedBy = completedCount === 1 && role.isLocked ? "hardcoded" as const : "user" as const;

    yield { type: "role_selected", roleId: role.id, roleName: role.name, selectedBy };
    yield { type: "step_start", roleName: role.name, model: role.modelName, provider: role.providerId };
    yield { type: "chain_progress", current: completedCount, total: totalEstimate };

    // Execute
    let stepOutput = "";
    let stepSucceeded = false;

    const stepGen = executeStepStreaming(
      role, memory, userMessage,
      completedCount === 1 ? localContext : "",
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

    // Validate
    const validation = validateStepOutput(role, stepOutput);
    if (!validation.valid) {
      yield { type: "warning", message: `⚠️ ${role.name}: ${validation.issues.join("; ")}` };
      logger.warn("orchestrator", `${role.name} validation: ${validation.issues.join("; ")}`);
    }

    // Fix cycle: Tester found critical errors → insert Кодер + Тестировщик
    if (role.id === "role_tester" && fixCycleCount < MAX_FIX_CYCLES) {
      if (testerFoundCriticalErrors(stepOutput)) {
        fixCycleCount++;

        const coder = await getRoleById("role_coder");
        const tester = await getRoleById("role_tester");

        if (coder?.isActive && tester?.isActive) {
          yield {
            type: "warning",
            message: `🔄 Критические ошибки. Кодер исправляет (цикл ${fixCycleCount}/${MAX_FIX_CYCLES})...`,
          };

          // Кодер goes first, then Тестировщик re-checks
          queue.unshift(coder, tester);
        }
      }
    }
  }

  yield { type: "done" };
}
