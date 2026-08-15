import type { SQLiteDatabase } from 'expo-sqlite';
import { compactConversation, sendMessage } from '../engine';
import { useSalStore } from '@/state/store';
import { createDefaultCapabilities, createDefaultLimits } from '@/domain/modelConfig';
import type { AdapterEvent, ChatRequest, ProviderAdapter } from '@/adapters/types';
import type { AttachmentBlob, Conversation, CredentialProfile, Message, Model, Provider } from '@/domain/types';
import { adapterFor } from '@/adapters';

jest.mock('@/adapters', () => ({ adapterFor: jest.fn() }));
jest.mock('expo-crypto', () => { let id = 0; return { randomUUID: () => `generated-${++id}` }; });
jest.mock('@/storage/attachments', () => ({ attachmentBase64: jest.fn().mockResolvedValue('BASE64') }));
jest.mock('@/storage/secrets', () => ({ resolveCredential: jest.fn(async (profile) => ({ profile, headers: { Authorization: 'Bearer hidden' } })), deleteCredentialSecrets: jest.fn() }));

const now = '2026-01-01';
const provider: Provider = { id: 'p', displayName: 'Provider', kind: 'openai_chat', baseUrl: 'https://example.com/v1', icon: { type: 'emoji', value: 'P' }, lastCredentialId: null, createdAt: now, updatedAt: now };
const credential: CredentialProfile = { id: 'c', providerId: 'p', displayName: 'Work', apiKeyRef: 'secret', organizationRef: null, projectRef: null, headers: [], createdAt: now, updatedAt: now };
const model: Model = { id: 'm', providerId: 'p', wireId: 'model', displayName: 'Model', description: '', icon: { type: 'emoji', value: 'M' }, enabled: true, favorite: false, sortOrder: 0, capabilities: createDefaultCapabilities('openai_chat'), limits: createDefaultLimits('openai_chat'), defaults: { systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [], reasoningMode: 'provider_default' }, rawRequestOverrides: {}, compatibilityNotes: '', createdAt: now, updatedAt: now };
const conversation: Conversation = { id: 'v', title: 'New conversation', selectedModelId: 'm', selectedCredentialId: 'c', systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [], context: { mode: 'inherit', note: '', pinnedMessageIds: [], checkpoint: null }, createdAt: now, updatedAt: now };
const image: AttachmentBlob = { id: 'a', sha256: 'hash', mimeType: 'image/png', originalName: 'x.png', byteSize: 1, storedUri: 'file://x', modality: 'image', createdAt: now, referenceCount: 0 };

function fakeDb(): SQLiteDatabase {
  const db: Record<string, unknown> = { runAsync: jest.fn().mockResolvedValue({ changes: 1 }), getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }) };
  db.withTransactionAsync = jest.fn(async (callback: () => Promise<void>) => callback());
  db.withExclusiveTransactionAsync = jest.fn(async (callback: (txn: SQLiteDatabase) => Promise<void>) => callback(db as unknown as SQLiteDatabase));
  return db as unknown as SQLiteDatabase;
}

function reset(modelOverride: Partial<Model> = {}, attachments: AttachmentBlob[] = []) {
  useSalStore.setState({
    db: fakeDb(), initialized: true, providers: [provider], credentials: [credential], models: [{ ...model, ...modelOverride }],
    conversations: [conversation], messages: [], generations: [], attachments,
    settings: { reasoningVisibility: 'collapsed', colorScheme: 'system', hapticsEnabled: true, diagnosticsIncludeProviderBody: true, contextManagementDefault: 'automatic' },
  });
}

function adapter(events: AdapterEvent[] = [], error?: Error): ProviderAdapter {
  return {
    testConnection: jest.fn(), listModels: jest.fn(), inspectModel: jest.fn(), previewRequest: jest.fn(),
    streamChat: async function* () { for (const event of events) yield event; if (error) throw error; },
  } as unknown as ProviderAdapter;
}

function history(turns = 6, textLength = 1_000): Message[] {
  return Array.from({ length: turns * 2 }, (_, index) => ({
    id: `history-${index}`,
    conversationId: 'v',
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    parts: [{ type: 'text' as const, text: `${index}: ${'x'.repeat(textLength)}` }],
    status: 'complete' as const,
    createdAt: `2026-01-01T00:${String(index).padStart(2, '0')}:00.000Z`,
    updatedAt: now,
  }));
}

function requestAwareAdapter(streamChat: (request: ChatRequest) => AsyncGenerator<AdapterEvent>): ProviderAdapter {
  return {
    testConnection: jest.fn(), listModels: jest.fn(), inspectModel: jest.fn(), previewRequest: jest.fn(), streamChat,
  } as unknown as ProviderAdapter;
}

describe('chat send lifecycle', () => {
  beforeEach(() => { jest.clearAllMocks(); reset(); });

  it('persists streamed text, reasoning, usage, provenance and last successful account', async () => {
    (adapterFor as jest.Mock).mockReturnValue(adapter([
      { type: 'reasoning_delta', text: 'thinking' }, { type: 'text_delta', text: 'Hello' }, { type: 'text_delta', text: ' there' },
      { type: 'usage', promptTokens: 3, completionTokens: 2, totalTokens: 5 }, { type: 'finish', reason: 'stop' },
    ]));
    await sendMessage({ conversationId: 'v', text: 'Hi' });
    const state = useSalStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages.find((item) => item.role === 'assistant')).toEqual(expect.objectContaining({ status: 'complete', parts: [{ type: 'reasoning', text: 'thinking' }, { type: 'text', text: 'Hello there' }] }));
    expect(state.generations[0]).toEqual(expect.objectContaining({ totalTokens: 5, finishReason: 'stop', provenance: expect.objectContaining({ credentialName: 'Work' }) }));
    expect(state.providers[0]?.lastCredentialId).toBe('c');
    expect(state.conversations[0]?.title).toBe('Hi');
  });

  it('keeps partial output and records an interrupted failure', async () => {
    (adapterFor as jest.Mock).mockReturnValue(adapter([{ type: 'text_delta', text: 'Partial' }], new Error('request timed out')));
    await sendMessage({ conversationId: 'v', text: 'Hi' });
    const assistant = useSalStore.getState().messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('interrupted');
    expect(assistant?.parts).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('Partial') }));
    expect(useSalStore.getState().generations[0]?.errorCode).toBe('timeout');
  });

  it('rejects media that the configured model does not support before writing messages', async () => {
    reset({}, [image]);
    await expect(sendMessage({ conversationId: 'v', text: 'Look', attachmentIds: ['a'] })).rejects.toMatchObject({
      name: 'ConfigurationError',
      message: expect.stringContaining('not configured for image'),
      destination: { kind: 'model', modelId: 'm', focus: 'capabilities' },
    });
    expect(useSalStore.getState().messages).toEqual([]);
  });

  it('rejects oversized attachments with a limits destination', async () => {
    reset(
      {
        capabilities: { ...createDefaultCapabilities('openai_chat'), image: { value: true, mode: 'supported', source: 'manual' } },
        limits: { ...createDefaultLimits('openai_chat'), maxFileBytes: { value: 1, mode: 'supported', source: 'manual' } },
      },
      [{ ...image, byteSize: 8 }],
    );
    await expect(sendMessage({ conversationId: 'v', text: 'Look', attachmentIds: ['a'] })).rejects.toMatchObject({
      destination: { kind: 'model', modelId: 'm', focus: 'limits' },
    });
  });

  it('rejects too many attachments with a limits destination', async () => {
    reset(
      {
        capabilities: { ...createDefaultCapabilities('openai_chat'), image: { value: true, mode: 'supported', source: 'manual' } },
        limits: { ...createDefaultLimits('openai_chat'), maxAttachmentCount: { value: 0, mode: 'supported', source: 'manual' } },
      },
      [image],
    );
    await expect(sendMessage({ conversationId: 'v', text: 'Look', attachmentIds: ['a'] })).rejects.toMatchObject({
      name: 'ConfigurationError',
      destination: { kind: 'model', modelId: 'm', focus: 'limits' },
    });
  });

  it('requires an explicit account when the provider has accounts', async () => {
    reset();
    useSalStore.setState({ conversations: [{ ...conversation, selectedCredentialId: null }], providers: [{ ...provider, lastCredentialId: null }] });
    await expect(sendMessage({ conversationId: 'v', text: 'Hi' })).rejects.toMatchObject({
      name: 'ConfigurationError',
      destination: { kind: 'provider', providerId: 'p' },
    });
  });

  it('sends missing-model and missing-provider failures to the models list', async () => {
    reset();
    useSalStore.setState({ conversations: [{ ...conversation, selectedModelId: null }] });
    await expect(sendMessage({ conversationId: 'v', text: 'Hi' })).rejects.toMatchObject({
      destination: { kind: 'models' },
    });
    reset();
    useSalStore.setState({ providers: [] });
    await expect(sendMessage({ conversationId: 'v', text: 'Hi' })).rejects.toMatchObject({
      destination: { kind: 'models' },
    });
  });

  it('automatically compacts known context before sending and keeps local history intact', async () => {
    reset({ limits: { ...createDefaultLimits('openai_chat'), contextWindow: { value: 3_000, mode: 'supported', source: 'manual' } } });
    const original = history();
    useSalStore.setState({ messages: original });
    const purposes: ChatRequest['purpose'][] = [];
    (adapterFor as jest.Mock).mockReturnValue(requestAwareAdapter(async function* (request) {
      purposes.push(request.purpose);
      if (request.purpose === 'compaction') {
        yield { type: 'text_delta', text: 'Durable earlier context.' };
        yield { type: 'usage', promptTokens: 100, completionTokens: 8, totalTokens: 108 };
      } else {
        yield { type: 'text_delta', text: 'Done' };
        yield { type: 'finish', reason: 'stop' };
      }
    }));

    await sendMessage({ conversationId: 'v', text: 'Continue' });

    expect(purposes).toContain('compaction');
    expect(useSalStore.getState().conversations[0]?.context.checkpoint?.summary).toBe('Durable earlier context.');
    expect(useSalStore.getState().messages).toEqual(expect.arrayContaining(original));
    expect(useSalStore.getState().messages).toHaveLength(original.length + 2);
  });

  it('recovers reactively from an unknown provider context limit', async () => {
    reset();
    const original = history(4, 50);
    useSalStore.setState({ messages: original });
    let chatCalls = 0;
    (adapterFor as jest.Mock).mockReturnValue(requestAwareAdapter(async function* (request) {
      if (request.purpose === 'compaction') {
        yield { type: 'text_delta', text: 'Recovered checkpoint.' };
        return;
      }
      chatCalls += 1;
      if (chatCalls === 1) throw new Error('maximum context length exceeded');
      yield { type: 'text_delta', text: 'Recovered answer' };
      yield { type: 'finish', reason: 'stop' };
    }));

    await sendMessage({ conversationId: 'v', text: 'Retry me' });

    expect(chatCalls).toBe(2);
    expect(useSalStore.getState().conversations[0]?.context.checkpoint?.summary).toBe('Recovered checkpoint.');
    expect(useSalStore.getState().messages.find((item) => item.role === 'assistant' && item.parts.some((part) => part.type === 'text' && part.text === 'Recovered answer'))?.status).toBe('complete');
  });

  it('removes the attempted turn when reactive compaction fails so the composer can restore it', async () => {
    reset();
    const original = history(4, 50);
    useSalStore.setState({ messages: original });
    (adapterFor as jest.Mock).mockReturnValue(requestAwareAdapter(async function* (request) {
      if (request.purpose === 'compaction') throw new Error('summarizer unavailable');
      throw new Error('maximum context length exceeded');
    }));

    await expect(sendMessage({ conversationId: 'v', text: 'Keep my draft' })).rejects.toMatchObject({ name: 'ContextPreparationError' });
    expect(useSalStore.getState().messages).toEqual(original);
    expect(useSalStore.getState().generations).toEqual([]);
  });

  it('restores the attempted turn if the provider still overflows after reactive compaction', async () => {
    reset();
    const original = history(4, 50);
    useSalStore.setState({ messages: original });
    (adapterFor as jest.Mock).mockReturnValue(requestAwareAdapter(async function* (request) {
      if (request.purpose === 'compaction') {
        yield { type: 'text_delta', text: 'Smaller checkpoint.' };
        return;
      }
      throw new Error('maximum context length exceeded');
    }));

    await expect(sendMessage({ conversationId: 'v', text: 'Still too long' })).rejects.toMatchObject({ name: 'ContextPreparationError' });
    expect(useSalStore.getState().messages).toEqual(original);
    expect(useSalStore.getState().generations).toEqual([]);
  });

  it('supports explicit manual compaction', async () => {
    reset();
    useSalStore.setState({ messages: history() });
    (adapterFor as jest.Mock).mockReturnValue(requestAwareAdapter(async function* (request) {
      expect(request.purpose).toBe('compaction');
      yield { type: 'text_delta', text: 'Manual checkpoint.' };
    }));

    await expect(compactConversation('v')).resolves.toBeGreaterThan(0);
    expect(useSalStore.getState().conversations[0]?.context.checkpoint?.summary).toBe('Manual checkpoint.');
  });

  it('keeps the previous checkpoint if a rebuild request fails', async () => {
    reset();
    useSalStore.setState({ messages: history() });
    (adapterFor as jest.Mock).mockReturnValue(requestAwareAdapter(async function* () {
      yield { type: 'text_delta', text: 'Existing checkpoint.' };
    }));
    await compactConversation('v');
    (adapterFor as jest.Mock).mockReturnValue(requestAwareAdapter(async function* () {
      throw new Error('rebuild unavailable');
    }));

    await expect(compactConversation('v', true)).rejects.toThrow('rebuild unavailable');
    expect(useSalStore.getState().conversations[0]?.context.checkpoint?.summary).toBe('Existing checkpoint.');
  });
});
