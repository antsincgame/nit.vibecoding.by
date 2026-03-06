import { useState } from "react";
import type { AgentRole } from "@shared/types/agentRole";
import { NeonModal } from "~/components/ui/NeonModal";
import { NeonButton } from "~/components/ui/NeonButton";
import { cn } from "~/lib/utils/cn";

interface PromptTesterProps {
  open: boolean;
  onClose: () => void;
  role: AgentRole;
}

export function PromptTester({ open, onClose, role }: PromptTesterProps) {
  const [testInput, setTestInput] = useState("Создай лендинг для стартапа по доставке еды");
  const [result, setResult] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setDuration(null);

    const start = Date.now();

    try {
      const res = await fetch("/api/pipeline/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "__test__",
          roleId: role.id,
          message: testInput,
          localContext: "",
          projectType: "react",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const nlIdx = buffer.indexOf("\n");
          if (nlIdx === -1) break;

          const line = buffer.slice(0, nlIdx).trim();
          buffer = buffer.slice(nlIdx + 1);

          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "text" && parsed.text) {
              accumulated += parsed.text;
            }
            if (parsed.type === "error") {
              throw new Error(parsed.message);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      setResult(accumulated || "(пустой ответ)");
      setDuration(Date.now() - start);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка тестирования");
    } finally {
      setLoading(false);
    }
  };

  return (
    <NeonModal open={open} onClose={onClose} title={`Тест: ${role.name}`}>
      <div className="space-y-4">
        {/* Test input */}
        <div>
          <label className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary mb-1 block">
            Тестовый запрос
          </label>
          <textarea
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            rows={3}
            className={cn(
              "w-full bg-deep-space border border-border-subtle rounded px-3 py-2",
              "text-sm text-text-primary outline-none focus:border-gold-pure/40 resize-none",
            )}
          />
        </div>

        <div className="flex items-center gap-2">
          <NeonButton variant="primary" size="sm" onClick={handleTest} disabled={loading || !testInput.trim()}>
            {loading ? "Генерация..." : "Запустить тест"}
          </NeonButton>
          {duration != null && (
            <span className="text-[11px] text-text-muted">
              {(duration / 1000).toFixed(1)}с | {role.modelName}@{role.providerId}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="glass rounded px-3 py-2 border border-red-400/20">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-deep-space/60 rounded p-3 border border-border-subtle max-h-[300px] overflow-y-auto">
            <pre className="text-xs text-text-primary whitespace-pre-wrap font-mono leading-relaxed">
              {result}
            </pre>
          </div>
        )}
      </div>
    </NeonModal>
  );
}
