import { useEffect, useMemo, useRef } from "react";
import { cn } from "~/lib/utils/cn";
import { extractChatText, extractGeneratedFileNames } from "~/lib/utils/codeParser";
import { useT } from "~/lib/utils/i18n";
import { AgentBadge } from "./AgentBadge";
import type { ChatMessage } from "@shared/types/message";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

function StreamingStatus({ content }: { content: string }) {
  const t = useT();
  const fileNames = useMemo(() => extractGeneratedFileNames(content), [content]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
        <span className="text-xs text-neon-cyan">{t("chat.generating")}</span>
      </div>
      {fileNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {fileNames.map((name) => (
            <span
              key={name}
              className="inline-block px-1.5 py-0.5 text-[9px] font-mono bg-deep-space/60 border border-border-subtle rounded text-text-secondary"
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FileSummary({ content }: { content: string }) {
  const t = useT();
  const fileNames = useMemo(() => extractGeneratedFileNames(content), [content]);
  if (fileNames.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-text-secondary">
        {t("chat.code_generated")} ({fileNames.length}):
      </span>
      <div className="flex flex-wrap gap-1">
        {fileNames.map((name) => (
          <span
            key={name}
            className="inline-block px-1.5 py-0.5 text-[9px] font-mono bg-neon-emerald/10 border border-neon-emerald/20 rounded text-neon-emerald"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) {
  const isUser = message.role === "user";
  const t = useT();

  const displayText = useMemo(() => {
    if (isUser) return message.content;
    return extractChatText(message.content);
  }, [message.content, isUser]);

  const isThinking = isStreaming && !displayText;
  const isCodeOnly = !isStreaming && !displayText && message.content.length > 0;

  return (
    <div
      className={cn(
        "animate-fade-in-up",
        isUser ? "flex justify-end" : "flex justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[90%] rounded-lg px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-gold-pure/10 border border-gold-pure/20 text-text-primary"
            : "glass text-text-primary",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : isStreaming && isThinking ? (
          <>
            <AgentBadge message={message} />
            <StreamingStatus content={message.content} />
          </>
        ) : isCodeOnly ? (
          <>
            <AgentBadge message={message} />
            <FileSummary content={message.content} />
          </>
        ) : (
          <div className="space-y-2">
            <AgentBadge message={message} />
            {displayText && (
              <div className="text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[40vh] overflow-y-auto overflow-x-hidden">
                {displayText}
              </div>
            )}
            {!isStreaming && message.content.length > 0 && (
              <FileSummary content={message.content} />
            )}
            {isStreaming && (
              <StreamingStatus content={message.content} />
            )}
          </div>
        )}

        {!isUser && message.model && !message.agentRoleName && (
          <div className="mt-2 pt-2 border-t border-border-subtle flex items-center gap-2">
            <span className="text-[10px] text-text-muted truncate">{message.model}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (!isStreaming) return;
    const el = containerRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isStreaming]);

  if (messages.length === 0) return null;

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg, idx) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isStreaming={isStreaming && idx === messages.length - 1 && msg.role === "assistant"}
        />
      ))}
    </div>
  );
}
