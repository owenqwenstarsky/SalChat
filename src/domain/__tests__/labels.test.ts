import { providerKindName } from '../labels';

describe('providerKindName', () => {
  it('names known protocols and falls back to the raw kind', () => {
    expect(providerKindName('openai_chat')).toBe('OpenAI Chat Completions');
    expect(providerKindName('ollama_native')).toBe('Ollama');
    expect(providerKindName('litellm')).toBe('LiteLLM');
    expect(providerKindName('custom')).toBe('custom');
  });
});
