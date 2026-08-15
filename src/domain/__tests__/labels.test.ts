import { composerPlaceholder, modelLabel, prettyModelName, providerKindName } from '../labels';

describe('providerKindName', () => {
  it('names known protocols and falls back to the raw kind', () => {
    expect(providerKindName('openai_chat')).toBe('OpenAI Chat Completions');
    expect(providerKindName('ollama_native')).toBe('Ollama');
    expect(providerKindName('litellm')).toBe('LiteLLM');
    expect(providerKindName('custom')).toBe('custom');
  });
});

describe('prettyModelName', () => {
  it('turns slugs into readable titles and drops noise suffixes', () => {
    expect(prettyModelName('muse-spark-1.2-contributor')).toBe('Muse Spark 1.2');
    expect(prettyModelName('gpt-4o')).toBe('GPT 4o');
    expect(prettyModelName('gpt-4o-mini')).toBe('GPT 4o Mini');
    expect(prettyModelName('llama3.2:latest')).toBe('Llama 3.2');
    expect(prettyModelName('meta-llama/Llama-3.1-8B-Instruct')).toBe('Llama 3.1 8B');
    expect(prettyModelName('qwen2.5-coder:7b')).toBe('Qwen 2.5 Coder 7B');
  });

  it('keeps a custom display name and pretty-prints raw wire IDs', () => {
    expect(modelLabel({ displayName: 'Spark', wireId: 'muse-spark-1.2-contributor' })).toBe('Spark');
    expect(modelLabel({ displayName: 'muse-spark-1.2-contributor', wireId: 'muse-spark-1.2-contributor' })).toBe('Muse Spark 1.2');
  });

  it('builds a short composer placeholder', () => {
    expect(composerPlaceholder(null)).toBe('Choose a model');
    expect(composerPlaceholder({ displayName: 'muse-spark-1.2-contributor', wireId: 'muse-spark-1.2-contributor' })).toBe('Message Muse Spark 1.2');
    expect(composerPlaceholder({ displayName: 'A very long custom model title', wireId: 'x' })).toBe('Message');
  });
});
