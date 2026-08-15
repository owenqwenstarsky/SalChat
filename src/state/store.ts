import { create } from 'zustand';
import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  AppSettings,
  AttachmentBlob,
  Conversation,
  CredentialProfile,
  Generation,
  Message,
  Model,
  Provider,
} from '@/domain/types';
import { deletePayload, loadPayloads, loadSetting, saveSetting, upsertPayload } from '@/storage/database';
import { deleteCredentialSecrets } from '@/storage/secrets';

const DEFAULT_SETTINGS: AppSettings = {
  reasoningVisibility: 'collapsed',
  colorScheme: 'system',
  hapticsEnabled: true,
  diagnosticsIncludeProviderBody: true,
};

interface SalState {
  db: SQLiteDatabase | null;
  initialized: boolean;
  providers: Provider[];
  credentials: CredentialProfile[];
  models: Model[];
  conversations: Conversation[];
  messages: Message[];
  generations: Generation[];
  attachments: AttachmentBlob[];
  settings: AppSettings;
  hydrate: (db: SQLiteDatabase) => Promise<void>;
  saveProvider: (provider: Provider) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  saveCredential: (credential: CredentialProfile) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;
  saveModel: (model: Model) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  saveConversation: (conversation: Conversation) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  saveMessage: (message: Message) => Promise<void>;
  saveGeneration: (generation: Generation) => Promise<void>;
  saveAttachment: (attachment: AttachmentBlob) => Promise<void>;
  deleteAttachment: (id: string) => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
}

export const useSalStore = create<SalState>((set, get) => ({
  db: null,
  initialized: false,
  providers: [],
  credentials: [],
  models: [],
  conversations: [],
  messages: [],
  generations: [],
  attachments: [],
  settings: DEFAULT_SETTINGS,

  hydrate: async (db) => {
    const [providers, credentials, models, conversations, messages, generations, attachments, settings] = await Promise.all([
      loadPayloads<Provider>(db, 'providers'),
      loadPayloads<CredentialProfile>(db, 'credentials'),
      loadPayloads<Model>(db, 'models'),
      loadPayloads<Conversation>(db, 'conversations'),
      loadPayloads<Message>(db, 'messages'),
      loadPayloads<Generation>(db, 'generations'),
      loadPayloads<AttachmentBlob>(db, 'attachments'),
      loadSetting<AppSettings>(db, 'app'),
    ]);
    set({ db, providers, credentials, models, conversations, messages, generations, attachments, settings: settings ?? DEFAULT_SETTINGS, initialized: true });
  },

  saveProvider: async (provider) => {
    const db = requireDb(get());
    await upsertPayload(db, 'providers', provider);
    set((state) => ({ providers: replaceById(state.providers, provider) }));
  },

  deleteProvider: async (id) => {
    const db = requireDb(get());
    const credentials = get().credentials.filter((item) => item.providerId === id);
    await Promise.all(credentials.map((credential) => get().deleteCredential(credential.id)));
    await Promise.all(get().models.filter((model) => model.providerId === id).map((model) => get().deleteModel(model.id)));
    await deletePayload(db, 'providers', id);
    set((state) => ({ providers: state.providers.filter((item) => item.id !== id) }));
  },

  saveCredential: async (credential) => {
    const db = requireDb(get());
    await upsertPayload(db, 'credentials', credential);
    set((state) => ({ credentials: replaceById(state.credentials, credential) }));
  },

  deleteCredential: async (id) => {
    const db = requireDb(get());
    const profile = get().credentials.find((item) => item.id === id);
    if (profile) await deleteCredentialSecrets(profile);
    await deletePayload(db, 'credentials', id);
    set((state) => ({ credentials: state.credentials.filter((item) => item.id !== id) }));
  },

  saveModel: async (model) => {
    const db = requireDb(get());
    await upsertPayload(db, 'models', model);
    set((state) => ({ models: replaceById(state.models, model) }));
  },

  deleteModel: async (id) => {
    const db = requireDb(get());
    await deletePayload(db, 'models', id);
    set((state) => ({ models: state.models.filter((item) => item.id !== id) }));
  },

  saveConversation: async (conversation) => {
    const db = requireDb(get());
    await upsertPayload(db, 'conversations', conversation);
    set((state) => ({ conversations: replaceById(state.conversations, conversation) }));
  },

  deleteConversation: async (id) => {
    const db = requireDb(get());
    const messageIds = get().messages.filter((message) => message.conversationId === id).map((message) => message.id);
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync('DELETE FROM generations WHERE conversation_id = ?', id);
      await txn.runAsync('DELETE FROM message_attachments WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?)', id);
      await txn.runAsync('DELETE FROM messages WHERE conversation_id = ?', id);
      await txn.runAsync('DELETE FROM conversations WHERE id = ?', id);
    });
    set((state) => ({
      conversations: state.conversations.filter((item) => item.id !== id),
      messages: state.messages.filter((item) => !messageIds.includes(item.id)),
      generations: state.generations.filter((item) => item.conversationId !== id),
    }));
  },

  saveMessage: async (message) => {
    const db = requireDb(get());
    await upsertPayload(db, 'messages', message);
    const attachmentIds = message.parts.filter((part) => part.type === 'attachment').map((part) => part.attachmentId);
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync('DELETE FROM message_attachments WHERE message_id = ?', message.id);
      for (const attachmentId of attachmentIds) await txn.runAsync('INSERT OR IGNORE INTO message_attachments (message_id, attachment_id) VALUES (?, ?)', message.id, attachmentId);
    });
    set((state) => ({ messages: replaceById(state.messages, message) }));
  },

  saveGeneration: async (generation) => {
    const db = requireDb(get());
    await upsertPayload(db, 'generations', generation);
    set((state) => ({ generations: replaceById(state.generations, generation) }));
  },

  saveAttachment: async (attachment) => {
    const db = requireDb(get());
    await upsertPayload(db, 'attachments', attachment);
    set((state) => ({ attachments: replaceById(state.attachments, attachment) }));
  },

  deleteAttachment: async (id) => {
    const db = requireDb(get());
    const references = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM message_attachments WHERE attachment_id = ?', id);
    if ((references?.count ?? 0) > 0) throw new Error('Remove this attachment from every referenced conversation before deleting it.');
    await deletePayload(db, 'attachments', id);
    set((state) => ({ attachments: state.attachments.filter((item) => item.id !== id) }));
  },

  saveSettings: async (settings) => {
    const db = requireDb(get());
    await saveSetting(db, 'app', settings);
    set({ settings });
  },
}));

function requireDb(state: SalState): SQLiteDatabase {
  if (!state.db) throw new Error('Sal database is not ready.');
  return state.db;
}

function replaceById<T extends { id: string }>(items: T[], value: T): T[] {
  const index = items.findIndex((item) => item.id === value.id);
  if (index < 0) return [...items, value];
  return items.map((item) => (item.id === value.id ? value : item));
}
