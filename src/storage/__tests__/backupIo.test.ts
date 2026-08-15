/* eslint-disable import/first */
const mockBackupFiles = new Map<string, Uint8Array>();

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(root: string, name: string) { this.uri = `${root}/${name}`; }
    create = jest.fn();
  }
  class File {
    uri: string;
    constructor(first: string | Directory, name?: string) { this.uri = typeof first === 'string' ? (name ? `${first}/${name}` : first) : `${first.uri}/${name}`; }
    get exists() { return mockBackupFiles.has(this.uri); }
    create({ overwrite }: { overwrite?: boolean } = {}) { if (!overwrite && this.exists) throw new Error('exists'); mockBackupFiles.set(this.uri, new Uint8Array()); }
    write(bytes: Uint8Array) { mockBackupFiles.set(this.uri, bytes); }
    bytesSync() { return mockBackupFiles.get(this.uri) ?? new Uint8Array(); }
  }
  return { Directory, File, Paths: { document: '/docs', cache: '/cache' } };
});

import type { SQLiteDatabase } from 'expo-sqlite';
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { AttachmentBlob } from '@/domain/types';
import { Platform } from 'react-native';
import { buildBackupArchive, downloadBackupArchive, inspectBackupArchive, readBackupArchive, restoreBackupArchive, writeBackupArchive, type BackupData } from '../backup';

const attachment: AttachmentBlob = { id: 'a', sha256: 'hash', mimeType: 'image/png', originalName: 'x.png', byteSize: 3, storedUri: 'file://source', modality: 'image', createdAt: '2026', referenceCount: 1 };
const data: BackupData = {
  providers: [{ id: 'p', displayName: 'P', kind: 'openai_chat', baseUrl: 'https://example.com/v1', icon: { type: 'emoji', value: 'P' }, lastCredentialId: null, createdAt: '2026', updatedAt: '2026' }],
  credentials: [], models: [],
  conversations: [{ id: 'v', title: 'Chat', selectedModelId: null, selectedCredentialId: null, systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [], context: { mode: 'inherit', note: '', pinnedMessageIds: [], checkpoint: null }, createdAt: '2026', updatedAt: '2026' }],
  messages: [{ id: 'msg', conversationId: 'v', role: 'user', parts: [{ type: 'attachment', attachmentId: 'a', mimeType: 'image/png', name: 'x.png' }], status: 'complete', createdAt: '2026', updatedAt: '2026' }],
  generations: [], attachments: [attachment],
  settings: { reasoningVisibility: 'collapsed', colorScheme: 'system', hapticsEnabled: true, diagnosticsIncludeProviderBody: true, contextManagementDefault: 'automatic' },
};

function fakeDb(): SQLiteDatabase {
  const db: Record<string, unknown> = { runAsync: jest.fn().mockResolvedValue({ changes: 1 }), execAsync: jest.fn().mockResolvedValue(undefined) };
  db.withTransactionAsync = jest.fn(async (callback: () => Promise<void>) => callback());
  return db as unknown as SQLiteDatabase;
}

describe('backup archive I/O', () => {
  beforeEach(() => { mockBackupFiles.clear(); mockBackupFiles.set('file://source', new Uint8Array([1, 2, 3])); });

  it('builds a portable archive and writes it to cache', () => {
    const archive = buildBackupArchive(data);
    const manifest = inspectBackupArchive(archive);
    expect(manifest.data.attachments[0]).not.toHaveProperty('storedUri');
    const uri = writeBackupArchive(archive);
    expect(uri).toContain('/cache/sal-chat-');
    expect(mockBackupFiles.get(uri)).toEqual(archive);
  });

  it('restores relational records, references, settings, and attachment bytes', async () => {
    const db = fakeDb();
    await restoreBackupArchive(db, buildBackupArchive(data));
    expect(db.withTransactionAsync).toHaveBeenCalled();
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('message_attachments'), 'msg', 'a');
    expect(mockBackupFiles.get('/docs/sal-attachments/hash')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('reuses an existing content-addressed file during restore', async () => {
    mockBackupFiles.set('/docs/sal-attachments/hash', new Uint8Array([1, 2, 3]));
    await expect(restoreBackupArchive(fakeDb(), buildBackupArchive(data))).resolves.toBeUndefined();
  });

  it('normalizes version 1 backups with context defaults', () => {
    const files = unzipSync(buildBackupArchive(data));
    const legacy = JSON.parse(new TextDecoder().decode(files['manifest.json']!));
    legacy.version = 1;
    delete legacy.data.settings.contextManagementDefault;
    delete legacy.data.conversations[0].context;
    files['manifest.json'] = strToU8(JSON.stringify(legacy));

    const manifest = inspectBackupArchive(zipSync(files));

    expect(manifest.data.settings.contextManagementDefault).toBe('automatic');
    expect(manifest.data.conversations[0]?.context).toEqual({ mode: 'inherit', note: '', pinnedMessageIds: [], checkpoint: null });
  });

  it('packs data-URL attachments and restores them inline on web', async () => {
    const dataUrl = 'data:image/png;base64,AQID';
    const archive = buildBackupArchive({
      ...data,
      attachments: [{ ...attachment, storedUri: dataUrl }],
    });
    expect(inspectBackupArchive(archive).data.attachments[0]).not.toHaveProperty('storedUri');

    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    try {
      const db = fakeDb();
      await restoreBackupArchive(db, archive);
      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO attachments'),
        'a',
        'hash',
        expect.stringContaining(dataUrl),
        '2026',
      );
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
    }
  });

  it('reads native backup files through the FileSystem adapter', async () => {
    mockBackupFiles.set('file://backup', new Uint8Array([9, 8, 7]));
    await expect(readBackupArchive('file://backup')).resolves.toEqual(new Uint8Array([9, 8, 7]));
  });

  it('downloads a zip in the browser and fetches selected backup bytes', async () => {
    const original = Platform.OS;
    const click = jest.fn();
    const link = { href: '', download: '', click, remove: jest.fn() };
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: () => link, body: { appendChild: jest.fn() } },
    });
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      value: { createObjectURL: () => 'blob:backup', revokeObjectURL: jest.fn() },
    });
    Object.defineProperty(globalThis, 'Blob', {
      configurable: true,
      value: class MockBlob { constructor(public parts: unknown[]) {} },
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
    } as Response);
    try {
      expect(() => downloadBackupArchive(new Uint8Array([1, 2, 3]))).not.toThrow();
      expect(click).toHaveBeenCalled();
      expect(link.download).toContain('.salchat');
      await expect(readBackupArchive('blob:picked')).resolves.toEqual(new Uint8Array([4, 5, 6]));
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
      await expect(readBackupArchive('blob:missing')).rejects.toThrow('Could not read');
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
      jest.restoreAllMocks();
    }
  });

  it('refuses browser downloads on native', () => {
    expect(() => downloadBackupArchive(new Uint8Array([1]))).toThrow('Browser downloads');
  });
});
