export function providerKindName(kind: string): string {
  return (
    {
      openai_chat: 'OpenAI Chat Completions',
      ollama_native: 'Ollama',
      ollama_openai_chat: 'Ollama · Chat Completions',
      llama_cpp: 'llama.cpp',
      litellm: 'LiteLLM',
    } as Record<string, string>
  )[kind] ?? kind;
}
