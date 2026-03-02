import { create } from "zustand";
import type { ChatMessage, StreamingState } from "@shared/types/message";

type ProjectChatSnapshot = {
  messages: ChatMessage[];
  generatedCode: Record<string, string>;
};

type ChatState = {
  messages: ChatMessage[];
  streaming: StreamingState;
  generatedCode: Record<string, string>;
  projectCache: Record<string, ProjectChatSnapshot>;
  isChatLoading: boolean;
};

type ChatActions = {
  addMessage: (message: ChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  clearMessages: () => void;
  setStreaming: (state: Partial<StreamingState>) => void;
  setGeneratedCode: (files: Record<string, string>) => void;
  updateGeneratedFile: (filePath: string, content: string) => void;
  resetChat: () => void;
  saveProjectChat: (projectId: string) => void;
  loadProjectChat: (projectId: string) => Promise<void>;
  persistToDb: (projectId: string) => void;
};

const INITIAL_STREAMING: StreamingState = {
  isStreaming: false,
  currentContent: "",
  error: null,
};

async function fetchMessagesFromApi(projectId: string): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`/api/messages?projectId=${encodeURIComponent(projectId)}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

function saveMessagesToApi(projectId: string, messages: ChatMessage[]): void {
  fetch("/api/messages", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, messages }),
  }).catch(() => {});
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  messages: [],
  streaming: INITIAL_STREAMING,
  generatedCode: {},
  projectCache: {},
  isChatLoading: false,

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateLastAssistantMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      const lastIdx = messages.findLastIndex((m: ChatMessage) => m.role === "assistant");
      if (lastIdx >= 0) {
        messages[lastIdx] = { ...messages[lastIdx]!, content };
      }
      return { messages };
    }),

  clearMessages: () => set({ messages: [] }),

  setStreaming: (partial) =>
    set((state) => ({ streaming: { ...state.streaming, ...partial } })),

  setGeneratedCode: (files) => set({ generatedCode: files }),

  updateGeneratedFile: (filePath, content) =>
    set((state) => ({
      generatedCode: { ...state.generatedCode, [filePath]: content },
    })),

  resetChat: () =>
    set({
      messages: [],
      streaming: INITIAL_STREAMING,
      generatedCode: {},
    }),

  saveProjectChat: (projectId) => {
    const { messages, generatedCode } = get();
    if (messages.length === 0 && Object.keys(generatedCode).length === 0) return;

    set((state) => ({
      projectCache: {
        ...state.projectCache,
        [projectId]: { messages: [...messages], generatedCode: { ...generatedCode } },
      },
    }));

    saveMessagesToApi(projectId, messages);
  },

  persistToDb: (projectId) => {
    const { messages } = get();
    if (messages.length === 0) return;
    saveMessagesToApi(projectId, messages);
  },

  loadProjectChat: async (projectId) => {
    if (get().streaming.isStreaming) return;

    const cached = get().projectCache[projectId];

    if (cached) {
      set({
        messages: cached.messages,
        generatedCode: cached.generatedCode,
        streaming: INITIAL_STREAMING,
        isChatLoading: false,
      });
      return;
    }

    set({ isChatLoading: true });

    const dbMessages = await fetchMessagesFromApi(projectId);

    set((state) => ({
      messages: dbMessages,
      generatedCode: {},
      streaming: INITIAL_STREAMING,
      isChatLoading: false,
      projectCache: dbMessages.length > 0
        ? {
            ...state.projectCache,
            [projectId]: { messages: dbMessages, generatedCode: {} },
          }
        : state.projectCache,
    }));
  },
}));
