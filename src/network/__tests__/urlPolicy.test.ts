import { isPrivateHost, joinProviderPath, validateProviderUrl } from '../urlPolicy';

describe('provider URL policy', () => {
  it.each(['10.0.0.5', '172.16.1.2', '172.31.9.4', '192.168.1.4', 'localhost', 'modelbox.local', 'fe80::1', 'fd00::1'])(
    'recognizes private host %s', (host) => expect(isPrivateHost(host)).toBe(true),
  );

  it('allows private HTTP with a warning', () => {
    expect(validateProviderUrl('http://192.168.1.2:11434/')).toEqual(expect.objectContaining({ valid: true, requiresLanWarning: true, normalizedUrl: 'http://192.168.1.2:11434' }));
  });

  it('allows public HTTPS without a warning and explains physical-device localhost', () => {
    expect(validateProviderUrl('https://example.com')).toEqual(expect.objectContaining({ valid: true, requiresLanWarning: false }));
    expect(validateProviderUrl('http://localhost:11434').message).toContain('phone');
    expect(validateProviderUrl('http://localhost:11434', 'web').message).toBeUndefined();
  });

  it('rejects public HTTP and unsupported protocols', () => {
    expect(validateProviderUrl('http://example.com').code).toBe('insecure_public_http');
    expect(validateProviderUrl('ftp://example.com').code).toBe('unsupported_protocol');
    expect(validateProviderUrl('not a url').code).toBe('invalid_url');
  });

  it('normalizes /v1 paths without duplication', () => {
    expect(joinProviderPath('https://example.com/v1', '/v1/models')).toBe('https://example.com/v1/models');
    expect(joinProviderPath('https://example.com', 'api/chat')).toBe('https://example.com/api/chat');
    expect(joinProviderPath('https://example.com/', '/v1/models')).toBe('https://example.com/v1/models');
  });
});
