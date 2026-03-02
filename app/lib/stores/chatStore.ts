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
};

type ChatActions = {
  addMessage: (message: ChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  clearMessages: () => void;
  setStreaming: (state: Partial<StreamingState>) => void;
  setGeneratedCode: (files: Record<string, string>) => void;
  resetChat: () => void;
  saveProjectChat: (projectId: string) => void;
  loadProjectChat: (projectId: string) => void;
};

const INITIAL_STREAMING: StreamingState = {
  isStreaming: false,
  currentContent: "",
  error: null,
};

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  messages: [],
  streaming: INITIAL_STREAMING,
  generatedCode: {},
  projectCache: {},

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
  },

  loadProjectChat: (projectId) => {
    const cached = get().projectCache[projectId];
    if (cached) {
      set({
        messages: cached.messages,
        generatedCode: cached.generatedCode,
        streaming: INITIAL_STREAMING,
      });
    } else {
      set({
        messages: [],
        generatedCode: {},
        streaming: INITIAL_STREAMING,
      });
    }
  },
}));
