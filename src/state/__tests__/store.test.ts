import type { SQLiteDatabase } from 'expo-sqlite';
import { useSalStore } from '../store';
import type { AppSettings, AttachmentBlob, Conversation, CredentialProfile, Generation, Message, Model, Provider } from '@/domain/types';
import { createDefaultCapabilities, createDefaultLimits } from '@/domain/modelConfig';

jest.mock('expo-secure-store', () => ({ deleteItemAsync: jest.fn(), getItemAsync: jest.fn(), setItemAsync: jest.fn() }));

const now = '2026-01-01';
const provider: Provider = { id: 'p', displayName: 'Provider', kind: 'openai_chat', baseUrl: 'https://example.com/v1', icon: { type: 'emoji', value: 'P' }, lastCredentialId: null, createdAt: now, updatedAt: now };
const credential: CredentialProfile = { id: 'c', providerId: 'p', displayName: 'Work', apiKeyRef: null, organizationRef: null, projectRef: null, headers: [], createdAt: now, updatedAt: now };
const model: Model = { id: 'm', providerId: 'p', wireId: 'model', displayName: 'Model', description: '', icon: { type: 'emoji', value: 'M' }, enabled: true, favorite: false, sortOrder: 0, capabilities: createDefaultCapabilities('openai_chat'), limits: createDefaultLimits('openai_chat'), defaults: { systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [], reasoningMode: 'provider_default' }, rawRequestOverrides: {}, compatibilityNotes: '', createdAt: now, updatedAt: now };
const conversation: Conversation = { id: 'v', title: 'Chat', selectedModelId: 'm', selectedCredentialId: 'c', systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [], context: { mode: 'inherit', note: '', pinnedMessageIds: [], checkpoint: null }, createdAt: now, updatedAt: now };
const message: Message = { id: 'msg', conversationId: 'v', role: 'user', parts: [{ type: 'text', text: 'hi' }, { type: 'attachment', attachmentId: 'a', mimeType: 'image/png', name: 'x' }], status: 'complete', createdAt: now, updatedAt: now };
const generation: Generation = { id: 'g', conversationId: 'v', messageId: 'msg', provenance: { providerId: 'p', providerName: 'Provider', modelId: 'm', modelName: 'Model', wireModelId: 'model', credentialId: 'c', credentialName: 'Work' }, finishReason: 'stop', promptTokens: 1, completionTokens: 1, totalTokens: 2, latencyMs: 10, errorCode: null, createdAt: now };
const attachment: AttachmentBlob = { id: 'a', sha256: 'hash', mimeType: 'image/png', originalName: 'x.png', byteSize: 1, storedUri: 'file://x', modality: 'image', createdAt: now, referenceCount: 0 };
const settings: AppSettings = { reasoningVisibility: 'hidden', colorScheme: 'dark', hapticsEnabled: false, diagnosticsIncludeProviderBody: false, contextManagementDefault: 'manual' };

function fakeDb(): SQLiteDatabase {
  const db: Record<string, unknown> = {
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }), execAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
  };
  db.withTransactionAsync = jest.fn(async (callback: () => Promise<void>) => callback());
  db.withExclusiveTransactionAsync = jest.fn(async (callback: (txn: SQLiteDatabase) => Promise<void>) => callback(db as unknown as SQLiteDatabase));
  return db as unknown as SQLiteDatabase;
}

describe('Sal state persistence', () => {
  beforeEach(() => {
    useSalStore.setState({ db: fakeDb(), initialized: true, providers: [], credentials: [], models: [], conversations: [], messages: [], generations: [], attachments: [], settings: { reasoningVisibility: 'collapsed', colorScheme: 'system', hapticsEnabled: true, diagnosticsIncludeProviderBody: true, contextManagementDefault: 'automatic' } });
  });

  it('persists each core domain record and settings', async () => {
    const state = useSalStore.getState();
    await state.saveProvider(provider); await state.saveCredential(credential); await state.saveModel(model); await state.saveConversation(conversation);
    await state.saveAttachment(attachment); await state.saveMessage(message); await state.saveGeneration(generation); await state.saveSettings(settings);
    const next = useSalStore.getState();
    expect(next.providers).toEqual([provider]); expect(next.credentials).toEqual([credential]); expect(next.models).toEqual([model]);
    expect(next.conversations).toEqual([conversation]); expect(next.messages).toEqual([message]); expect(next.generations).toEqual([generation]);
    expect(next.attachments).toEqual([attachment]); expect(next.settings).toEqual(settings);
  });

  it('replaces existing records rather than duplicating them', async () => {
    await useSalStore.getState().saveProvider(provider);
    await useSalStore.getState().saveProvider({ ...provider, displayName: 'Renamed' });
    expect(useSalStore.getState().providers).toHaveLength(1);
    expect(useSalStore.getState().providers[0]?.displayName).toBe('Renamed');
  });

  it('deletes conversations with messages and generations', async () => {
    useSalStore.setState({ conversations: [conversation], messages: [message], generations: [generation] });
    await useSalStore.getState().deleteConversation('v');
    expect(useSalStore.getState()).toMatchObject({ conversations: [], messages: [], generations: [] });
  });

  it('allows orphan attachment deletion and blocks referenced files', async () => {
    useSalStore.setState({ attachments: [attachment] });
    await useSalStore.getState().deleteAttachment('a');
    expect(useSalStore.getState().attachments).toEqual([]);
    const db = fakeDb();
    (db.getFirstAsync as jest.Mock).mockResolvedValue({ count: 2 });
    useSalStore.setState({ db, attachments: [attachment] });
    await expect(useSalStore.getState().deleteAttachment('a')).rejects.toThrow('referenced conversation');
  });

  it('cascades provider models and credentials', async () => {
    useSalStore.setState({ providers: [provider], credentials: [credential], models: [model] });
    await useSalStore.getState().deleteProvider('p');
    expect(useSalStore.getState()).toMatchObject({ providers: [], credentials: [], models: [] });
  });

  it('writes attachment links once and skips them on unchanged stream updates', async () => {
    const db = fakeDb();
    useSalStore.setState({ db, messages: [] });
    await useSalStore.getState().saveMessage(message);
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('message_attachments'), message.id, 'a');
    (db.runAsync as jest.Mock).mockClear();
    (db.withTransactionAsync as jest.Mock).mockClear();
    await useSalStore.getState().saveMessage({ ...message, updatedAt: '2026-01-02' });
    expect(db.withTransactionAsync).not.toHaveBeenCalled();
    expect(db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('message_attachments'), expect.anything(), expect.anything());
  });
});
