/**
 * Lightweight token estimation without external tokenizer dependencies.
 * Uses a chars-per-token ratio calibrated for English/code mixed content.
 * Typical ratio: GPT-family ~3.5-4 chars/token, local models ~3.2-3.8.
 * We use 3.5 as a conservative estimate (slight overcount is safer than undercount).
 */
const CHARS_PER_TOKEN = 3.5;
const SAFETY_MARGIN = 256;
const MIN_OUTPUT_BUDGET = 1024;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
): number {
  let total = estimateTokens(systemPrompt);
  for (const msg of messages) {
    total += estimateTokens(msg.content) + 4; // 4 tokens overhead per message (role, delimiters)
  }
  return total;
}

export type TokenBudget = {
  inputEstimate: number;
  contextWindow: number;
  availableOutput: number;
  effectiveMaxTokens: number;
  overflow: boolean;
};

export function computeTokenBudget(
  inputEstimate: number,
  contextWindow: number,
  requestedMaxTokens: number,
): TokenBudget {
  const availableOutput = contextWindow - inputEstimate - SAFETY_MARGIN;
  const overflow = availableOutput < MIN_OUTPUT_BUDGET;
  const effectiveMaxTokens = overflow
    ? MIN_OUTPUT_BUDGET
    : Math.min(requestedMaxTokens, availableOutput);

  return {
    inputEstimate,
    contextWindow,
    availableOutput: Math.max(0, availableOutput),
    effectiveMaxTokens,
    overflow,
  };
}
