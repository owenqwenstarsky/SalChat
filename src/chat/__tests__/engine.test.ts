import type { SQLiteDatabase } from 'expo-sqlite';
import { sendMessage } from '../engine';
import { useSalStore } from '@/state/store';
import { createDefaultCapabilities, createDefaultLimits } from '@/domain/modelConfig';
import type { AdapterEvent, ProviderAdapter } from '@/adapters/types';
import type { AttachmentBlob, Conversation, CredentialProfile, Model, Provider } from '@/domain/types';
import { adapterFor } from '@/adapters';

jest.mock('@/adapters', () => ({ adapterFor: jest.fn() }));
jest.mock('expo-crypto', () => { let id = 0; return { randomUUID: () => `generated-${++id}` }; });
jest.mock('@/storage/attachments', () => ({ attachmentBase64: jest.fn().mockResolvedValue('BASE64') }));
jest.mock('@/storage/secrets', () => ({ resolveCredential: jest.fn(async (profile) => ({ profile, headers: { Authorization: 'Bearer hidden' } })), deleteCredentialSecrets: jest.fn() }));

const now = '2026-01-01';
const provider: Provider = { id: 'p', displayName: 'Provider', kind: 'openai_chat', baseUrl: 'https://example.com/v1', icon: { type: 'emoji', value: 'P' }, lastCredentialId: null, createdAt: now, updatedAt: now };
const credential: CredentialProfile = { id: 'c', providerId: 'p', displayName: 'Work', apiKeyRef: 'secret', organizationRef: null, projectRef: null, headers: [], createdAt: now, updatedAt: now };
const model: Model = { id: 'm', providerId: 'p', wireId: 'model', displayName: 'Model', description: '', icon: { type: 'emoji', value: 'M' }, enabled: true, favorite: false, sortOrder: 0, capabilities: createDefaultCapabilities('openai_chat'), limits: createDefaultLimits('openai_chat'), defaults: { systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [], reasoningMode: 'provider_default' }, rawRequestOverrides: {}, compatibilityNotes: '', createdAt: now, updatedAt: now };
const conversation: Conversation = { id: 'v', title: 'New conversation', selectedModelId: 'm', selectedCredentialId: 'c', systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [], createdAt: now, updatedAt: now };
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
    settings: { reasoningVisibility: 'collapsed', colorScheme: 'system', hapticsEnabled: true, diagnosticsIncludeProviderBody: true },
  });
}

function adapter(events: AdapterEvent[] = [], error?: Error): ProviderAdapter {
  return {
    testConnection: jest.fn(), listModels: jest.fn(), inspectModel: jest.fn(), previewRequest: jest.fn(),
    streamChat: async function* () { for (const event of events) yield event; if (error) throw error; },
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
    await expect(sendMessage({ conversationId: 'v', text: 'Look', attachmentIds: ['a'] })).rejects.toThrow('not configured for image');
    expect(useSalStore.getState().messages).toEqual([]);
  });

  it('requires an explicit account when the provider has accounts', async () => {
    reset();
    useSalStore.setState({ conversations: [{ ...conversation, selectedCredentialId: null }], providers: [{ ...provider, lastCredentialId: null }] });
    await expect(sendMessage({ conversationId: 'v', text: 'Hi' })).rejects.toThrow('Choose an account');
  });
});
