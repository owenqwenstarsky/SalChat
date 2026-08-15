import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { AppSettings, AttachmentBlob, Conversation, CredentialProfile, Generation, Message, Model, Provider } from '@/domain/types';

export const BACKUP_VERSION = 1;

export interface BackupData {
  providers: Provider[];
  credentials: CredentialProfile[];
  models: Model[];
  conversations: Conversation[];
  messages: Message[];
  generations: Generation[];
  attachments: AttachmentBlob[];
  settings: AppSettings;
}

export interface BackupManifest {
  format: 'sal-chat-backup';
  version: number;
  exportedAt: string;
  data: Omit<BackupData, 'attachments'> & { attachments: Omit<AttachmentBlob, 'storedUri'>[] };
}

export function sanitizeCredentialForBackup(profile: CredentialProfile): CredentialProfile {
  return { ...profile, apiKeyRef: null, organizationRef: null, projectRef: null, headers: profile.headers.map((header) => ({ name: header.name, secretRef: '' })) };
}

export function buildBackupArchive(data: BackupData): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const manifest: BackupManifest = {
    format: 'sal-chat-backup',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      ...data,
      credentials: data.credentials.map(sanitizeCredentialForBackup),
      attachments: data.attachments.map(({ storedUri: _storedUri, ...attachment }) => attachment),
    },
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  for (const attachment of data.attachments) files[`blobs/${attachment.sha256}`] = new File(attachment.storedUri).bytesSync();
  return zipSync(files, { level: 6 });
}

export function writeBackupArchive(bytes: Uint8Array): string {
  const file = new File(Paths.cache, `sal-chat-${new Date().toISOString().replace(/[:.]/g, '-')}.salchat`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

export function inspectBackupArchive(bytes: Uint8Array): BackupManifest {
  const { manifest } = parseArchive(bytes);
  return manifest;
}

export async function restoreBackupArchive(db: SQLiteDatabase, bytes: Uint8Array): Promise<void> {
  const { manifest, files } = parseArchive(bytes);
  const directory = new Directory(Paths.document, 'sal-attachments');
  directory.create({ idempotent: true, intermediates: true });
  const restoredAttachments: AttachmentBlob[] = [];
  for (const attachment of manifest.data.attachments) {
    const destination = new File(directory, attachment.sha256);
    if (!destination.exists) {
      destination.create({ overwrite: false });
      destination.write(files[`blobs/${attachment.sha256}`]!);
    }
    restoredAttachments.push({ ...attachment, storedUri: destination.uri });
  }

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      DELETE FROM message_attachments;
      DELETE FROM generations;
      DELETE FROM messages;
      DELETE FROM conversations;
      DELETE FROM models;
      DELETE FROM credentials;
      DELETE FROM providers;
      DELETE FROM attachments;
      DELETE FROM settings;
    `);
    for (const provider of manifest.data.providers) await txn.runAsync('INSERT INTO providers (id, payload, updated_at) VALUES (?, ?, ?)', provider.id, JSON.stringify(provider), provider.updatedAt);
    for (const credential of manifest.data.credentials) await txn.runAsync('INSERT INTO credentials (id, provider_id, payload, updated_at) VALUES (?, ?, ?, ?)', credential.id, credential.providerId, JSON.stringify(credential), credential.updatedAt);
    for (const model of manifest.data.models) await txn.runAsync('INSERT INTO models (id, provider_id, payload, updated_at) VALUES (?, ?, ?, ?)', model.id, model.providerId, JSON.stringify(model), model.updatedAt);
    for (const conversation of manifest.data.conversations) await txn.runAsync('INSERT INTO conversations (id, payload, updated_at) VALUES (?, ?, ?)', conversation.id, JSON.stringify(conversation), conversation.updatedAt);
    for (const message of manifest.data.messages) {
      await txn.runAsync('INSERT INTO messages (id, conversation_id, payload, updated_at) VALUES (?, ?, ?, ?)', message.id, message.conversationId, JSON.stringify(message), message.updatedAt);
      for (const part of message.parts) if (part.type === 'attachment') await txn.runAsync('INSERT OR IGNORE INTO message_attachments (message_id, attachment_id) VALUES (?, ?)', message.id, part.attachmentId);
    }
    for (const generation of manifest.data.generations) await txn.runAsync('INSERT INTO generations (id, conversation_id, message_id, payload, created_at) VALUES (?, ?, ?, ?, ?)', generation.id, generation.conversationId, generation.messageId, JSON.stringify(generation), generation.createdAt);
    for (const attachment of restoredAttachments) await txn.runAsync('INSERT INTO attachments (id, sha256, payload, created_at) VALUES (?, ?, ?, ?)', attachment.id, attachment.sha256, JSON.stringify(attachment), attachment.createdAt);
    await txn.runAsync('INSERT INTO settings (key, payload) VALUES (?, ?)', 'app', JSON.stringify(manifest.data.settings));
  });
}

function parseArchive(bytes: Uint8Array): { manifest: BackupManifest; files: Record<string, Uint8Array> } {
  const files = unzipSync(bytes);
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) throw new Error('This archive does not contain a Sal Chat manifest.');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as BackupManifest;
  if (manifest.format !== 'sal-chat-backup') throw new Error('This is not a Sal Chat backup.');
  if (manifest.version > BACKUP_VERSION) throw new Error('This backup was created by a newer version of Sal Chat.');
  for (const attachment of manifest.data.attachments) {
    if (!files[`blobs/${attachment.sha256}`]) throw new Error(`Attachment ${attachment.originalName} is missing from the archive.`);
  }
  return { manifest, files };
}
