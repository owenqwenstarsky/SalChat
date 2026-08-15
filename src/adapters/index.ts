import type { ProviderKind } from '@/domain/types';
import type { ProviderAdapter } from './types';
import { LlamaCppAdapter } from './llamaCpp';
import { OllamaNativeAdapter } from './ollamaNative';
import { OllamaOpenAiAdapter } from './ollamaOpenAi';
import { OpenAiChatAdapter } from './openaiChat';

const adapters: Record<ProviderKind, ProviderAdapter> = {
  openai_chat: new OpenAiChatAdapter(),
  ollama_native: new OllamaNativeAdapter(),
  ollama_openai_chat: new OllamaOpenAiAdapter(),
  llama_cpp: new LlamaCppAdapter(),
};

export function adapterFor(kind: ProviderKind): ProviderAdapter {
  return adapters[kind];
}
