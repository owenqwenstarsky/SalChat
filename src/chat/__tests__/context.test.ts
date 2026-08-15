import { buildEffectiveContext, calculateBudget, contextEnvelope, estimateTextTokens, selectCompactionChunk } from '../context';
import { createDefaultCapabilities, createDefaultLimits } from '@/domain/modelConfig';
import type { AttachmentBlob, Conversation, Message, Model, Provider } from '@/domain/types';

const timestamp = '2026-01-01T00:00:00.000Z';
const provider: Provider = { id: 'p', displayName: 'Provider', kind: 'openai_chat', baseUrl: 'https://example.com', icon: { type: 'emoji', value: 'P' }, lastCredentialId: null, createdAt: timestamp, updatedAt: timestamp };
const model: Model = {
  id: 'm', providerId: 'p', wireId: 'model', displayName: 'Model', description: '', icon: { type: 'emoji', value: 'M' }, enabled: true, favorite: false, sortOrder: 0,
  capabilities: createDefaultCapabilities('openai_chat'), limits: { ...createDefaultLimits('openai_chat'), contextWindow: { value: 8_000, mode: 'supported', source: 'manual' } },
  defaults: { systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [], reasoningMode: 'provider_default' }, rawRequestOverrides: {}, compatibilityNotes: '', createdAt: timestamp, updatedAt: timestamp,
};
const conversation = (patch: Partial<Conversation['context']> = {}): Conversation => ({
  id: 'c', title: 'Chat', selectedModelId: 'm', selectedCredentialId: null, systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [],
  context: { mode: 'inherit', note: '', pinnedMessageIds: [], checkpoint: null, ...patch }, createdAt: timestamp, updatedAt: timestamp,
});
const message = (id: string, role: Message['role'], text: string, minute: number, parts?: Message['parts']): Message => ({
  id, conversationId: 'c', role, status: 'complete', parts: parts ?? [{ type: 'text', text }], createdAt: `2026-01-01T00:${String(minute).padStart(2, '0')}:00.000Z`, updatedAt: timestamp,
});

describe('context budgeting', () => {
  it('uses the balanced ceiling and conservative UTF-8 estimates', () => {
    expect(calculateBudget(model, conversation(), 6_001)).toMatchObject({ contextWindow: 8_000, inputCeiling: 6_000, overBudget: true });
    expect(estimateTextTokens('abc')).toBe(1);
    expect(estimateTextTokens('🙂')).toBe(2);
  });

  it('keeps a checkpoint, pinned note, pinned old messages, and recent history in separate layers', () => {
    const old = message('old', 'user', 'exact old fact', 1);
    const boundary = message('boundary', 'assistant', 'old answer', 2);
    const recent = message('recent', 'user', 'new question', 3);
    const currentConversation = conversation({
      note: 'Always use SI units.',
      pinnedMessageIds: ['old'],
      checkpoint: {
        summary: 'Earlier summary', throughMessageId: 'boundary', revision: 1, sourceMessageCount: 2,
        estimatedTokensBefore: 100, estimatedTokensAfter: 10,
        provenance: { providerId: 'p', providerName: 'Provider', modelId: 'm', modelName: 'Model', wireModelId: 'model', credentialId: null, credentialName: null },
        promptTokens: 10, completionTokens: 5, totalTokens: 15, createdAt: timestamp,
      },
    });
    const effective = buildEffectiveContext(
      { provider, model, conversation: currentConversation, credential: { profile: null, headers: {} } },
      [old, boundary, recent],
      [],
      'recent',
    );
    expect(effective.messages.map((item) => item.id)).toEqual(['old', 'recent']);
    expect(effective.envelope).toContain('Always use SI units.');
    expect(effective.envelope).toContain('Earlier summary');
  });

  it('does not resend historical media when the model disables it', () => {
    const noMediaModel = { ...model, limits: { ...model.limits, resendsMediaInHistory: { value: false, mode: 'unsupported' as const, source: 'manual' as const } } };
    const image: AttachmentBlob = { id: 'a', sha256: 'hash', mimeType: 'image/png', originalName: 'x.png', byteSize: 1, storedUri: 'file://x', modality: 'image', createdAt: timestamp, referenceCount: 1 };
    const old = message('old', 'user', '', 1, [{ type: 'attachment', attachmentId: 'a', mimeType: 'image/png', name: 'x.png' }]);
    const current = message('current', 'user', '', 2, [{ type: 'attachment', attachmentId: 'a', mimeType: 'image/png', name: 'x.png' }]);
    const effective = buildEffectiveContext({ provider, model: noMediaModel, conversation: conversation(), credential: { profile: null, headers: {} } }, [old, current], [image], 'current');
    expect(effective.messages[0]?.parts).toEqual([]);
    expect(effective.messages[1]?.parts).toHaveLength(1);
  });

  it('keeps pinned historical media exact even when ordinary history media is disabled', () => {
    const noMediaModel = { ...model, limits: { ...model.limits, resendsMediaInHistory: { value: false, mode: 'unsupported' as const, source: 'manual' as const } } };
    const image: AttachmentBlob = { id: 'a', sha256: 'hash', mimeType: 'image/png', originalName: 'x.png', byteSize: 1, storedUri: 'file://x', modality: 'image', createdAt: timestamp, referenceCount: 1 };
    const pinned = message('pinned', 'user', '', 1, [{ type: 'attachment', attachmentId: 'a', mimeType: 'image/png', name: 'x.png' }]);
    const effective = buildEffectiveContext(
      { provider, model: noMediaModel, conversation: conversation({ pinnedMessageIds: ['pinned'] }), credential: { profile: null, headers: {} } },
      [pinned],
      [image],
    );
    expect(effective.messages[0]?.parts).toHaveLength(1);
  });
});

describe('compaction selection', () => {
  const messages = Array.from({ length: 12 }, (_, index) => message(`m${index}`, index % 2 ? 'assistant' : 'user', `turn ${index}`, index));

  it('preserves four recent user turns for manual compaction and skips pins', () => {
    const chunk = selectCompactionChunk(conversation({ pinnedMessageIds: ['m0'] }), messages, [], 8_000);
    expect(chunk?.messages.map((item) => item.id)).toEqual(['m1', 'm2', 'm3']);
    expect(chunk?.throughMessageId).toBe('m3');
  });

  it('can compact down to the newest turn during overflow recovery', () => {
    const chunk = selectCompactionChunk(conversation(), messages, [], 8_000, false, true);
    expect(chunk?.messages.length).toBeGreaterThan(3);
    expect(chunk?.messages.map((item) => item.id)).not.toContain('m10');
  });

  it('formats notes and summaries as explicitly bounded context', () => {
    expect(contextEnvelope(conversation({ note: 'Keep this' }))).toContain('<pinned_chat_context>');
  });
});
