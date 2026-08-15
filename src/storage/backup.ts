import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { DEFAULT_CONTEXT_MODE, normalizeConversation } from '@/domain/context';
import type { AppSettings, AttachmentBlob, Conversation, CredentialProfile, Generation, Message, Model, Provider } from '@/domain/types';

export const BACKUP_VERSION = 2;

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
  for (const attachment of data.attachments) files[`blobs/${attachment.sha256}`] = readStoredBytes(attachment.storedUri);
  return zipSync(files, { level: 6 });
}

export function writeBackupArchive(bytes: Uint8Array): string {
  const file = new File(Paths.cache, `sal-chat-${new Date().toISOString().replace(/[:.]/g, '-')}.salchat`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

export function downloadBackupArchive(bytes: Uint8Array): void {
  if (Platform.OS !== 'web') throw new Error('Browser downloads are only available on web.');
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const uri = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = uri;
  link.download = backupFilename();
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(uri), 0);
}

export async function readBackupArchive(uri: string): Promise<Uint8Array> {
  if (Platform.OS !== 'web') return new File(uri).bytesSync();
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Could not read the selected backup (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export function inspectBackupArchive(bytes: Uint8Array): BackupManifest {
  const { manifest } = parseArchive(bytes);
  return manifest;
}

export async function restoreBackupArchive(db: SQLiteDatabase, bytes: Uint8Array): Promise<void> {
  const { manifest, files } = parseArchive(bytes);
  const directory = Platform.OS === 'web' ? null : new Directory(Paths.document, 'sal-attachments');
  directory?.create({ idempotent: true, intermediates: true });
  const restoredAttachments: AttachmentBlob[] = [];
  for (const attachment of manifest.data.attachments) {
    const attachmentBytes = files[`blobs/${attachment.sha256}`]!;
    if (!directory) {
      restoredAttachments.push({
        ...attachment,
        storedUri: `data:${attachment.mimeType};base64,${bytesToBase64(attachmentBytes)}`,
      });
      continue;
    }
    const destination = new File(directory, attachment.sha256);
    if (!destination.exists) {
      destination.create({ overwrite: false });
      destination.write(attachmentBytes);
    }
    restoredAttachments.push({ ...attachment, storedUri: destination.uri });
  }

  await db.withTransactionAsync(async () => {
    await db.execAsync(`
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
    for (const provider of manifest.data.providers) await db.runAsync('INSERT INTO providers (id, payload, updated_at) VALUES (?, ?, ?)', provider.id, JSON.stringify(provider), provider.updatedAt);
    for (const credential of manifest.data.credentials) await db.runAsync('INSERT INTO credentials (id, provider_id, payload, updated_at) VALUES (?, ?, ?, ?)', credential.id, credential.providerId, JSON.stringify(credential), credential.updatedAt);
    for (const model of manifest.data.models) await db.runAsync('INSERT INTO models (id, provider_id, payload, updated_at) VALUES (?, ?, ?, ?)', model.id, model.providerId, JSON.stringify(model), model.updatedAt);
    for (const conversation of manifest.data.conversations) await db.runAsync('INSERT INTO conversations (id, payload, updated_at) VALUES (?, ?, ?)', conversation.id, JSON.stringify(conversation), conversation.updatedAt);
    for (const message of manifest.data.messages) {
      await db.runAsync('INSERT INTO messages (id, conversation_id, payload, updated_at) VALUES (?, ?, ?, ?)', message.id, message.conversationId, JSON.stringify(message), message.updatedAt);
      for (const part of message.parts) if (part.type === 'attachment') await db.runAsync('INSERT OR IGNORE INTO message_attachments (message_id, attachment_id) VALUES (?, ?)', message.id, part.attachmentId);
    }
    for (const generation of manifest.data.generations) await db.runAsync('INSERT INTO generations (id, conversation_id, message_id, payload, created_at) VALUES (?, ?, ?, ?, ?)', generation.id, generation.conversationId, generation.messageId, JSON.stringify(generation), generation.createdAt);
    for (const attachment of restoredAttachments) await db.runAsync('INSERT INTO attachments (id, sha256, payload, created_at) VALUES (?, ?, ?, ?)', attachment.id, attachment.sha256, JSON.stringify(attachment), attachment.createdAt);
    await db.runAsync('INSERT INTO settings (key, payload) VALUES (?, ?)', 'app', JSON.stringify(manifest.data.settings));
  });
}

function readStoredBytes(uri: string): Uint8Array {
  if (!uri.startsWith('data:')) return new File(uri).bytesSync();
  const encoded = uri.match(/^data:[^;,]+;base64,(.*)$/s)?.[1];
  if (encoded === undefined) throw new Error('This attachment uses an unsupported browser data URL.');
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function backupFilename(): string {
  return `sal-chat-${new Date().toISOString().replace(/[:.]/g, '-')}.salchat`;
}

function parseArchive(bytes: Uint8Array): { manifest: BackupManifest; files: Record<string, Uint8Array> } {
  const files = unzipSync(bytes);
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) throw new Error('This archive does not contain a Sal Chat manifest.');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as BackupManifest;
  if (manifest.format !== 'sal-chat-backup') throw new Error('This is not a Sal Chat backup.');
  if (manifest.version > BACKUP_VERSION) throw new Error('This backup was created by a newer version of Sal Chat.');
  manifest.data.conversations = manifest.data.conversations.map(normalizeConversation);
  manifest.data.settings = {
    ...manifest.data.settings,
    contextManagementDefault:
      manifest.data.settings.contextManagementDefault === 'manual' ? 'manual' : DEFAULT_CONTEXT_MODE,
  };
  for (const attachment of manifest.data.attachments) {
    if (!files[`blobs/${attachment.sha256}`]) throw new Error(`Attachment ${attachment.originalName} is missing from the archive.`);
  }
  return { manifest, files };
}
