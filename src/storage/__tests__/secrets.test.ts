import { deleteCredentialSecrets, resolveCredential, saveCredentialSecrets, validateCustomHeaders } from '../secrets';
import { secretStorage } from '../secretStorage';
import type { CredentialProfile } from '@/domain/types';

jest.mock('../secretStorage', () => ({
  secretStorage: { setItemAsync: jest.fn(), getItemAsync: jest.fn(), deleteItemAsync: jest.fn() },
}));

const profile = (): CredentialProfile => ({ id: 'c', providerId: 'p', displayName: 'Work', apiKeyRef: null, organizationRef: null, projectRef: null, headers: [], createdAt: '2026', updatedAt: '2026' });

describe('custom credential headers', () => {
  it('accepts provider authentication headers', () => {
    expect(validateCustomHeaders({ 'X-API-Key': 'secret', 'X-Tenant': 'work' })).toEqual({ 'X-API-Key': 'secret', 'X-Tenant': 'work' });
  });

  it.each(['Host', 'Content-Length', 'Connection', 'Transfer-Encoding'])('rejects transport-controlled header %s', (name) => {
    expect(() => validateCustomHeaders({ [name]: 'unsafe' })).toThrow('controlled by Sal');
  });

  it('rejects invalid names and non-string values', () => {
    expect(() => validateCustomHeaders({ 'bad header': 'x' })).toThrow('not a valid HTTP header');
    expect(() => validateCustomHeaders({ Valid: 42 })).toThrow('must be a string');
  });
});

describe('credential secret storage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores each secret separately and returns only opaque references', async () => {
    const saved = await saveCredentialSecrets(profile(), { apiKey: 'key', organization: 'org', project: 'project', headers: { 'X-API-Key': 'custom' } });
    expect(saved).toEqual(expect.objectContaining({ apiKeyRef: 'sal.credential.c.apiKey', organizationRef: 'sal.credential.c.organization', projectRef: 'sal.credential.c.project', headers: [{ name: 'X-API-Key', secretRef: 'sal.credential.c.header.0' }] }));
    expect(secretStorage.setItemAsync).toHaveBeenCalledTimes(4);
  });

  it('deletes empty replacements and resolves stored values into request headers', async () => {
    const saved = await saveCredentialSecrets(profile(), { apiKey: '', organization: '', project: '' });
    expect(saved.apiKeyRef).toBeNull();
    expect(secretStorage.deleteItemAsync).toHaveBeenCalledTimes(3);
    const configured: CredentialProfile = { ...profile(), apiKeyRef: 'key', organizationRef: 'org', projectRef: 'project', headers: [{ name: 'X-Custom', secretRef: 'header' }, { name: 'Skipped', secretRef: '' }] };
    (secretStorage.getItemAsync as jest.Mock).mockResolvedValueOnce('abc').mockResolvedValueOnce('org-1').mockResolvedValueOnce('proj-1').mockResolvedValueOnce('custom');
    await expect(resolveCredential(configured)).resolves.toEqual({ profile: configured, headers: { Authorization: 'Bearer abc', 'OpenAI-Organization': 'org-1', 'OpenAI-Project': 'proj-1', 'X-Custom': 'custom' } });
  });

  it('supports providers without an account and deletes all referenced secrets', async () => {
    await expect(resolveCredential(null)).resolves.toEqual({ profile: null, headers: {} });
    const configured: CredentialProfile = { ...profile(), apiKeyRef: 'key', headers: [{ name: 'X-Custom', secretRef: 'header' }] };
    await deleteCredentialSecrets(configured);
    expect(secretStorage.deleteItemAsync).toHaveBeenCalledWith('key');
    expect(secretStorage.deleteItemAsync).toHaveBeenCalledWith('header');
  });
});
