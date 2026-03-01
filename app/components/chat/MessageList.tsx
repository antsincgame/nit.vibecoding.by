import { useEffect, useMemo, useRef } from "react";
import { cn } from "~/lib/utils/cn";
import { extractChatText } from "~/lib/utils/codeParser";
import type { ChatMessage } from "@shared/types/message";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) {
  const isUser = message.role === "user";

  const displayText = useMemo(() => {
    if (isUser) return message.content;
    return extractChatText(message.content);
  }, [message.content, isUser]);

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
        ) : (
          <div className="text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[40vh] overflow-y-auto overflow-x-hidden">
            {displayText}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-0.5 bg-gold-pure/80 animate-pulse" />
            )}
          </div>
        )}

        {!isUser && message.model && (
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
