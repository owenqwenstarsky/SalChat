import { Directory, File, Paths } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { AttachmentBlob } from '@/domain/types';
import { createId } from '@/domain/factories';
import { loadPayloads, upsertPayload } from './database';

const CHUNK_BYTES = 1024 * 1024;

export async function hashFile(uri: string): Promise<string> {
  const file = new File(uri);
  const handle = file.open();
  const hash = sha256.create();
  try {
    while (handle.offset !== null && handle.size !== null && handle.offset < handle.size) {
      hash.update(handle.readBytes(Math.min(CHUNK_BYTES, handle.size - handle.offset)));
    }
    return bytesToHex(hash.digest());
  } finally {
    handle.close();
  }
}

export async function importAttachment(
  db: SQLiteDatabase,
  input: { uri: string; name: string; mimeType: string; size?: number },
): Promise<AttachmentBlob> {
  const digest = await hashFile(input.uri);
  const existing = (await loadPayloads<AttachmentBlob>(db, 'attachments')).find((item) => item.sha256 === digest);
  if (existing) return existing;

  const directory = new Directory(Paths.document, 'sal-attachments');
  directory.create({ idempotent: true, intermediates: true });
  const extension = extensionFor(input.name, input.mimeType);
  const destination = new File(directory, `${digest}${extension}`);
  new File(input.uri).copy(destination);
  const created: AttachmentBlob = {
    id: createId(),
    sha256: digest,
    mimeType: input.mimeType || destination.type || 'application/octet-stream',
    originalName: input.name,
    byteSize: input.size ?? destination.size,
    storedUri: destination.uri,
    modality: modalityFor(input.mimeType),
    createdAt: new Date().toISOString(),
    referenceCount: 0,
  };
  await upsertPayload(db, 'attachments', created);
  return created;
}

export async function attachmentBase64(blob: AttachmentBlob): Promise<string> {
  return new File(blob.storedUri).base64();
}

function modalityFor(mime: string): AttachmentBlob['modality'] {
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'image';
}

function extensionFor(name: string, mime: string): string {
  const fromName = name.match(/\.[a-z0-9]{1,8}$/i)?.[0];
  if (fromName) return fromName.toLowerCase();
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'audio/mpeg') return '.mp3';
  if (mime === 'video/mp4') return '.mp4';
  return '.bin';
}
