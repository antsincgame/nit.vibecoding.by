/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly OLLAMA_BASE_URL: string;
  readonly LMSTUDIO_BASE_URL: string;
  readonly CUSTOM_LLM_URL: string;
  readonly CUSTOM_LLM_NAME: string;
  readonly CUSTOM_LLM_API_KEY: string;
  readonly APPWRITE_ENDPOINT: string;
  readonly APPWRITE_PROJECT_ID: string;
  readonly APPWRITE_API_KEY: string;
  readonly APPWRITE_MASTER_DB_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
