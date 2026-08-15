import type { SQLiteDatabase } from 'expo-sqlite';
import type { AttachmentBlob } from '@/domain/types';
import { attachmentBase64, hashFile, importAttachment } from '../attachments.web';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'web-attachment' }));
jest.mock('@noble/hashes/sha2.js', () => ({
  sha256: (bytes: Uint8Array) => new Uint8Array([bytes.reduce((sum, value) => (sum + value) % 256, 0)]),
}));
jest.mock('@noble/hashes/utils.js', () => ({
  bytesToHex: (bytes: Uint8Array) => [...bytes].map((value) => value.toString(16).padStart(2, '0')).join(''),
}));

const sourceBytes = new Uint8Array([1, 2, 3]);
const response = (bytes = sourceBytes, ok = true): Response => ({
  ok,
  status: ok ? 200 : 404,
  arrayBuffer: async () => bytes.buffer,
}) as Response;

function dbWith(payloads: AttachmentBlob[] = []): SQLiteDatabase {
  return {
    getAllAsync: jest.fn().mockResolvedValue(payloads.map((item) => ({ payload: JSON.stringify(item) }))),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  } as unknown as SQLiteDatabase;
}

describe('browser attachment storage', () => {
  beforeEach(() => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response());
    jest.spyOn(globalThis, 'btoa').mockImplementation((value) => (value === '\u0001\u0002\u0003' ? 'AQID' : ''));
  });

  afterEach(() => jest.restoreAllMocks());

  it('hashes and persists selected files as data URLs in SQLite', async () => {
    const digest = '06';
    await expect(hashFile('blob:source')).resolves.toBe(digest);

    const db = dbWith();
    await expect(importAttachment(db, {
      uri: 'blob:source',
      name: 'photo.png',
      mimeType: 'image/png',
    })).resolves.toEqual(expect.objectContaining({
      id: 'web-attachment',
      sha256: digest,
      byteSize: 3,
      modality: 'image',
      storedUri: 'data:image/png;base64,AQID',
    }));
    expect(db.runAsync).toHaveBeenCalled();
  });

  it('deduplicates content and supports all attachment modalities', async () => {
    const existing: AttachmentBlob = {
      id: 'existing', sha256: '06', mimeType: 'audio/mpeg', originalName: 'old.mp3',
      byteSize: 3, storedUri: 'data:audio/mpeg;base64,AQID', modality: 'audio', createdAt: '2026', referenceCount: 1,
    };
    await expect(importAttachment(dbWith([existing]), { uri: 'blob:source', name: 'new.mp3', mimeType: 'audio/mpeg' })).resolves.toEqual(existing);
    await expect(importAttachment(dbWith(), { uri: 'blob:source', name: 'clip.mp4', mimeType: 'video/mp4', size: 10 })).resolves.toEqual(expect.objectContaining({ modality: 'video', byteSize: 10 }));
  });

  it('reads inline and fetched attachment bytes as base64', async () => {
    const inline = { storedUri: 'data:image/png;base64,AQID' } as AttachmentBlob;
    const remote = { storedUri: 'blob:stored' } as AttachmentBlob;
    await expect(attachmentBase64(inline)).resolves.toBe('AQID');
    await expect(attachmentBase64(remote)).resolves.toBe('AQID');
  });

  it('reports unreadable browser files', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(response(sourceBytes, false));
    await expect(hashFile('blob:missing')).rejects.toThrow('Could not read');
  });
});
