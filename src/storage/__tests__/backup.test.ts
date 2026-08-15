import { strToU8, zipSync } from 'fflate';
import { BACKUP_VERSION, inspectBackupArchive, sanitizeCredentialForBackup } from '../backup';
import type { CredentialProfile } from '@/domain/types';

const emptyManifest = (patch: Record<string, unknown> = {}) => ({
  format: 'sal-chat-backup', version: BACKUP_VERSION, exportedAt: '2026-01-01',
  data: { providers: [], credentials: [], models: [], conversations: [], messages: [], generations: [], attachments: [], settings: { reasoningVisibility: 'collapsed', colorScheme: 'system', hapticsEnabled: true, diagnosticsIncludeProviderBody: true } },
  ...patch,
});

const archive = (manifest: unknown, files: Record<string, Uint8Array> = {}) => zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), ...files });

describe('backup validation', () => {
  it('reads a supported manifest', () => {
    expect(inspectBackupArchive(archive(emptyManifest())).format).toBe('sal-chat-backup');
  });

  it('rejects missing, foreign, and future manifests', () => {
    expect(() => inspectBackupArchive(zipSync({}))).toThrow('manifest');
    expect(() => inspectBackupArchive(archive(emptyManifest({ format: 'other' })))).toThrow('not a Sal Chat');
    expect(() => inspectBackupArchive(archive(emptyManifest({ version: BACKUP_VERSION + 1 })))).toThrow('newer version');
  });

  it('requires every declared attachment blob', () => {
    const manifest = emptyManifest();
    manifest.data.attachments.push({ id: 'a', sha256: 'hash', mimeType: 'image/png', originalName: 'x.png', byteSize: 1, modality: 'image', createdAt: '2026', referenceCount: 1 } as never);
    expect(() => inspectBackupArchive(archive(manifest))).toThrow('missing');
    expect(inspectBackupArchive(archive(manifest, { 'blobs/hash': new Uint8Array([1]) })).data.attachments).toHaveLength(1);
  });
});

describe('credential backup sanitization', () => {
  it('removes all secret references while preserving account and header names', () => {
    const profile: CredentialProfile = { id: 'c', providerId: 'p', displayName: 'Work', apiKeyRef: 'key', organizationRef: 'org', projectRef: 'project', headers: [{ name: 'X-Key', secretRef: 'header' }], createdAt: '2026', updatedAt: '2026' };
    expect(sanitizeCredentialForBackup(profile)).toEqual(expect.objectContaining({ apiKeyRef: null, organizationRef: null, projectRef: null, headers: [{ name: 'X-Key', secretRef: '' }] }));
  });
});
