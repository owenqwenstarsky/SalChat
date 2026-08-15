import { buildSystemPrompt, SAL_CHAT_SYSTEM_PROMPT } from '../systemPrompt';
import { createDefaultCapabilities, createDefaultLimits } from '@/domain/modelConfig';
import type { ChatRequest } from '@/adapters/types';

function request(modelPrompt = '', conversationPrompt = ''): ChatRequest {
  const timestamp = '2026-01-01';
  return {
    provider: { id: 'p', displayName: 'Provider', kind: 'openai_chat', baseUrl: 'https://example.com', icon: { type: 'emoji', value: 'P' }, lastCredentialId: null, createdAt: timestamp, updatedAt: timestamp },
    model: {
      id: 'm', providerId: 'p', wireId: 'model', displayName: 'Model', description: '', icon: { type: 'emoji', value: 'M' }, enabled: true, favorite: false, sortOrder: 0,
      capabilities: createDefaultCapabilities('openai_chat'), limits: createDefaultLimits('openai_chat'),
      defaults: { systemPrompt: modelPrompt, temperature: null, maxOutputTokens: null, stopSequences: [], reasoningMode: 'provider_default' },
      rawRequestOverrides: {}, compatibilityNotes: '', createdAt: timestamp, updatedAt: timestamp,
    },
    conversation: { id: 'c', title: 'Chat', selectedModelId: 'm', selectedCredentialId: null, systemPrompt: conversationPrompt, temperature: null, maxOutputTokens: null, stopSequences: [], createdAt: timestamp, updatedAt: timestamp },
    messages: [], credential: { profile: null, headers: {} }, attachments: {},
  };
}

describe('Sal Chat system prompt', () => {
  it('always describes the response harness and its math syntax', () => {
    const prompt = buildSystemPrompt(request());

    expect(prompt).toBe(SAL_CHAT_SYSTEM_PROMPT);
    expect(prompt).toContain('CommonMark-style Markdown');
    expect(prompt).toContain('Use inline math as $...$ or \\(...\\)');
    expect(prompt).toContain('Raw HTML and Mermaid diagrams are not rendered');
  });

  it('appends model instructions without replacing the harness contract', () => {
    const prompt = buildSystemPrompt(request('Answer like a patient physics tutor.'));

    expect(prompt.startsWith(SAL_CHAT_SYSTEM_PROMPT)).toBe(true);
    expect(prompt).toContain('<custom_instructions>\nAnswer like a patient physics tutor.\n</custom_instructions>');
  });

  it('uses conversation instructions instead of model defaults when both exist', () => {
    const prompt = buildSystemPrompt(request('Model default', '  Conversation override  '));

    expect(prompt).toContain('<custom_instructions>\nConversation override\n</custom_instructions>');
    expect(prompt).not.toContain('Model default');
  });
});
