import { describe, it, expect, vi } from "vitest";

// ─── Test SSE parsing logic from usePipelineStreaming ───
// We extract and test the parsing function directly

type PipelineEvent = {
  type: string;
  [key: string]: unknown;
};

function parsePipelineSSE(
  buffer: string,
  onEvent: (event: PipelineEvent) => void,
): { remaining: string; done: boolean; pipelineError: string | null } {
  let remaining = buffer;
  let done = false;
  let pipelineError: string | null = null;

  while (true) {
    const newlineIdx = remaining.indexOf("\n");
    if (newlineIdx === -1) break;

    const line = remaining.slice(0, newlineIdx);
    remaining = remaining.slice(newlineIdx + 1);

    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;

    const payload = trimmed.slice(6).trim();
    if (payload === "[DONE]") {
      done = true;
      break;
    }

    try {
      const parsed = JSON.parse(payload) as PipelineEvent;
      if (parsed.type === "error") {
        pipelineError = parsed.message as string;
        onEvent(parsed);
        break;
      }
      onEvent(parsed);
    } catch {
      // skip malformed JSON
    }
  }

  return { remaining, done, pipelineError };
}

describe("SSE parsing", () => {
  it("parses single text event", () => {
    const events: PipelineEvent[] = [];
    const result = parsePipelineSSE(
      'data: {"type":"text","text":"hello"}\n\n',
      (e) => events.push(e),
    );
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe("text");
    expect(events[0]!.text).toBe("hello");
    expect(result.done).toBe(false);
    expect(result.pipelineError).toBeNull();
  });

  it("parses multiple events in one chunk", () => {
    const events: PipelineEvent[] = [];
    const chunk = [
      'data: {"type":"session_init","sessionId":"s1"}',
      'data: {"type":"role_selected","roleId":"r1","roleName":"Архитектор","selectedBy":"hardcoded"}',
      'data: {"type":"step_start","roleName":"Архитектор","model":"mistral","provider":"ollama"}',
      'data: {"type":"text","text":"chunk1"}',
      'data: {"type":"text","text":"chunk2"}',
      'data: {"type":"step_complete","roleName":"Архитектор","durationMs":1500}',
      "",
    ].join("\n");

    parsePipelineSSE(chunk, (e) => events.push(e));
    expect(events.length).toBe(6);
    expect(events.map((e) => e.type)).toEqual([
      "session_init", "role_selected", "step_start", "text", "text", "step_complete",
    ]);
  });

  it("handles [DONE] signal", () => {
    const events: PipelineEvent[] = [];
    const result = parsePipelineSSE(
      'data: {"type":"text","text":"hello"}\ndata: [DONE]\n\n',
      (e) => events.push(e),
    );
    expect(events.length).toBe(1);
    expect(result.done).toBe(true);
  });

  it("captures error event without throwing", () => {
    const events: PipelineEvent[] = [];
    const result = parsePipelineSSE(
      'data: {"type":"text","text":"partial"}\ndata: {"type":"error","message":"Model timeout"}\n',
      (e) => events.push(e),
    );
    expect(events.length).toBe(2);
    expect(result.pipelineError).toBe("Model timeout");
  });

  it("keeps remaining buffer for incomplete lines", () => {
    const events: PipelineEvent[] = [];
    const result = parsePipelineSSE(
      'data: {"type":"text","text":"full"}\ndata: {"type":"te',
      (e) => events.push(e),
    );
    expect(events.length).toBe(1);
    expect(result.remaining).toBe('data: {"type":"te');
    expect(result.done).toBe(false);
  });

  it("skips malformed JSON", () => {
    const events: PipelineEvent[] = [];
    parsePipelineSSE(
      'data: {broken json}\ndata: {"type":"text","text":"ok"}\n',
      (e) => events.push(e),
    );
    expect(events.length).toBe(1);
    expect(events[0]!.text).toBe("ok");
  });

  it("handles chain progress events", () => {
    const events: PipelineEvent[] = [];
    const chunk = [
      'data: {"type":"chain_progress","current":1,"total":3}',
      'data: {"type":"role_selected","roleId":"r1","roleName":"Архитектор","selectedBy":"hardcoded"}',
      'data: {"type":"step_start","roleName":"Архитектор","model":"m","provider":"p"}',
      'data: {"type":"text","text":"output1"}',
      'data: {"type":"step_complete","roleName":"Архитектор","durationMs":5000}',
      'data: {"type":"chain_progress","current":2,"total":3}',
      'data: {"type":"role_selected","roleId":"r2","roleName":"Копирайтер","selectedBy":"user"}',
      "",
    ].join("\n");

    parsePipelineSSE(chunk, (e) => events.push(e));
    expect(events.filter((e) => e.type === "chain_progress").length).toBe(2);
    expect(events.filter((e) => e.type === "role_selected").length).toBe(2);
  });

  it("handles empty buffer", () => {
    const events: PipelineEvent[] = [];
    const result = parsePipelineSSE("", (e) => events.push(e));
    expect(events.length).toBe(0);
    expect(result.remaining).toBe("");
  });

  it("handles warning events", () => {
    const events: PipelineEvent[] = [];
    parsePipelineSSE(
      'data: {"type":"warning","message":"Retry 1/2..."}\n',
      (e) => events.push(e),
    );
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe("warning");
  });
});
