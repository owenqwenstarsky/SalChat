/* eslint-disable import/first */
const mockFiles = new Map<string, Uint8Array>();

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(_root: unknown, name: string) { this.uri = `/docs/${name}`; }
    create = jest.fn();
  }
  class File {
    uri: string;
    type = '';
    constructor(first: string | Directory, name?: string) { this.uri = typeof first === 'string' ? first : `${first.uri}/${name}`; }
    get size() { return mockFiles.get(this.uri)?.length ?? 0; }
    open() {
      const bytes = mockFiles.get(this.uri) ?? new Uint8Array();
      let cursor: number | null = 0;
      return {
        get offset() { return cursor; }, get size() { return cursor === null ? null : bytes.length; },
        readBytes(length: number) { const start = cursor ?? 0; const result = bytes.slice(start, start + length); cursor = start + result.length; return result; },
        close() { cursor = null; },
      };
    }
    copy(destination: File) { mockFiles.set(destination.uri, mockFiles.get(this.uri) ?? new Uint8Array()); }
    async base64() { return 'AQID'; }
  }
  return { Directory, File, Paths: { document: '/docs' } };
});

jest.mock('expo-crypto', () => { let id = 0; return { randomUUID: () => `attachment-${++id}` }; });
jest.mock('@noble/hashes/sha2.js', () => {
  const digest = (bytes: Uint8Array) => new Uint8Array([bytes.reduce((sum, value) => (sum + value) % 256, 0)]);
  return { sha256: Object.assign(digest, { create: () => { const chunks: number[] = []; return { update: (bytes: Uint8Array) => chunks.push(...bytes), digest: () => digest(new Uint8Array(chunks)) }; } }) };
});
jest.mock('@noble/hashes/utils.js', () => ({ bytesToHex: (bytes: Uint8Array) => [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('') }));

import type { SQLiteDatabase } from 'expo-sqlite';
import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { attachmentBase64, hashFile, importAttachment } from '../attachments';
import type { AttachmentBlob } from '@/domain/types';

function dbWith(payloads: AttachmentBlob[] = []): SQLiteDatabase {
  return {
    getAllAsync: jest.fn().mockResolvedValue(payloads.map((item) => ({ payload: JSON.stringify(item) }))),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  } as unknown as SQLiteDatabase;
}

describe('content-addressed attachment storage', () => {
  beforeEach(() => { mockFiles.clear(); mockFiles.set('file://source', new Uint8Array([1, 2, 3])); });

  it('hashes files incrementally with SHA-256', async () => {
    await expect(hashFile('file://source')).resolves.toBe(bytesToHex(sha256(new Uint8Array([1, 2, 3]))));
  });

  it.each([
    ['image/jpeg', 'photo', 'image', '.jpg'], ['audio/mpeg', 'voice', 'audio', '.mp3'], ['video/mp4', 'clip', 'video', '.mp4'],
  ] as const)('imports %s into its modality without duplicate bytes', async (mimeType, name, modality, extension) => {
    const db = dbWith();
    const result = await importAttachment(db, { uri: 'file://source', name, mimeType, size: 3 });
    expect(result).toEqual(expect.objectContaining({ mimeType, modality, byteSize: 3, storedUri: expect.stringContaining(extension) }));
    expect(db.runAsync).toHaveBeenCalled();
  });

  it('returns an existing blob for the same hash and reads base64 on demand', async () => {
    const digest = await hashFile('file://source');
    const existing: AttachmentBlob = { id: 'existing', sha256: digest, mimeType: 'image/png', originalName: 'old.png', byteSize: 3, storedUri: 'file://stored', modality: 'image', createdAt: '2026', referenceCount: 1 };
    await expect(importAttachment(dbWith([existing]), { uri: 'file://source', name: 'new.png', mimeType: 'image/png' })).resolves.toEqual(existing);
    await expect(attachmentBase64(existing)).resolves.toBe('AQID');
  });
});
