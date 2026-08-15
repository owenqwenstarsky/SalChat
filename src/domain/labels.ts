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

const TRAILING_NOISE = new Set([
  'base',
  'chat',
  'chatml',
  'contributor',
  'gguf',
  'hf',
  'instruct',
  'instruction',
  'latest',
  'preview',
]);

const ACRONYMS: Record<string, string> = {
  ai: 'AI',
  dpo: 'DPO',
  gpt: 'GPT',
  llm: 'LLM',
  lora: 'LoRA',
  moe: 'MoE',
  sft: 'SFT',
  vl: 'VL',
  vlm: 'VLM',
};

/** Human label for a wire model ID such as `muse-spark-1.2-contributor`. */
export function prettyModelName(wireId: string): string {
  const trimmed = wireId.trim();
  if (!trimmed) return wireId;
  const slug = (trimmed.split('/').pop() ?? trimmed).replace(/\.(gguf|bin)$/i, '');
  const colon = slug.lastIndexOf(':');
  const name = colon > 0 ? slug.slice(0, colon) : slug;
  const tag = colon > 0 ? slug.slice(colon + 1) : '';

  const tokens = name.split(/[-_\s]+/).flatMap(splitPackedVersion).filter(Boolean);
  while (tokens.length > 1 && TRAILING_NOISE.has(tokens[tokens.length - 1]!.toLowerCase())) {
    tokens.pop();
  }

  const words = tokens.map(formatModelToken);
  if (tag && !TRAILING_NOISE.has(tag.toLowerCase())) words.push(formatModelToken(tag));
  return words.join(' ') || trimmed;
}

/** Prefer a custom display name; otherwise pretty-print the wire ID. */
export function modelLabel(model: { displayName: string; wireId: string }): string {
  if (model.displayName.trim() && model.displayName.trim() !== model.wireId) return model.displayName.trim();
  return prettyModelName(model.wireId);
}

/** ChatGPT-style composer hint that stays short enough for the pill. */
export function composerPlaceholder(model: { displayName: string; wireId: string } | null): string {
  if (!model) return 'Choose a model';
  const name = modelLabel(model);
  return name.length <= 18 ? `Message ${name}` : 'Message';
}

function splitPackedVersion(token: string): string[] {
  const match = token.match(/^([A-Za-z]{3,})(\d+(?:\.\d+)*)$/);
  return match ? [match[1]!, match[2]!] : [token];
}

function formatModelToken(token: string): string {
  const lower = token.toLowerCase();
  if (ACRONYMS[lower]) return ACRONYMS[lower]!;
  if (/^gpt/i.test(token)) return `GPT${token.slice(3)}`;
  if (/^\d+(\.\d+)*[bBkKmMgG]$/.test(token)) return token.slice(0, -1) + token.slice(-1).toUpperCase();
  if (/^\d/.test(token) || /^v\d/i.test(token)) return token;
  if (token === token.toUpperCase() && /[A-Z]/.test(token)) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}
