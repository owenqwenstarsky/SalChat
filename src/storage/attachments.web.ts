import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { AttachmentBlob } from '@/domain/types';
import { createId } from '@/domain/factories';
import { loadPayloads, upsertPayload } from './database';

async function readUriBytes(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Could not read the selected file (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function hashFile(uri: string): Promise<string> {
  return bytesToHex(sha256(await readUriBytes(uri)));
}

export async function importAttachment(
  db: SQLiteDatabase,
  input: { uri: string; name: string; mimeType: string; size?: number },
): Promise<AttachmentBlob> {
  const bytes = await readUriBytes(input.uri);
  const digest = bytesToHex(sha256(bytes));
  const existing = (await loadPayloads<AttachmentBlob>(db, 'attachments')).find((item) => item.sha256 === digest);
  if (existing) return existing;

  const mimeType = input.mimeType || 'application/octet-stream';
  const created: AttachmentBlob = {
    id: createId(),
    sha256: digest,
    mimeType,
    originalName: input.name,
    byteSize: input.size ?? bytes.byteLength,
    storedUri: `data:${mimeType};base64,${bytesToBase64(bytes)}`,
    modality: modalityFor(mimeType),
    createdAt: new Date().toISOString(),
    referenceCount: 0,
  };
  await upsertPayload(db, 'attachments', created);
  return created;
}

export async function attachmentBase64(blob: AttachmentBlob): Promise<string> {
  const match = blob.storedUri.match(/^data:[^;,]+;base64,(.*)$/s);
  if (match?.[1]) return match[1];
  return bytesToBase64(await readUriBytes(blob.storedUri));
}

function modalityFor(mime: string): AttachmentBlob['modality'] {
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'image';
}
