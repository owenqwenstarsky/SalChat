import { classifyProviderError } from '../errors';
import { redactDiagnostic, redactHeaders, redactText } from '../redaction';

describe('provider error guidance', () => {
  it.each([
    [401, 'invalid API key', 'authentication'], [403, 'forbidden', 'authorization'], [429, 'rate limited', 'rate_limit'],
    [429, 'billing quota exceeded', 'quota'], [404, 'model does not exist', 'model_missing'], [500, 'internal error', 'server_error'],
  ] as const)('maps HTTP %s %s to %s', (status, body, code) => expect(classifyProviderError({ kind: 'openai_chat', status, body }).code).toBe(code));

  it('provides Ollama-specific LAN guidance', () => {
    const failure = classifyProviderError({ kind: 'ollama_native', message: 'connection refused' });
    expect(failure.code).toBe('connection_refused');
    expect(failure.guidance).toContain('Ollama');
  });

  it('recognizes context, media, protocol and malformed response failures', () => {
    expect(classifyProviderError({ kind: 'openai_chat', body: 'context length exceeded' }).code).toBe('context_length');
    expect(classifyProviderError({ kind: 'llama_cpp', body: 'missing image mmproj' }).code).toBe('unsupported_media');
    expect(classifyProviderError({ kind: 'ollama_native', status: 404, body: '/v1/chat/completions not found' }).code).toBe('protocol_mismatch');
    expect(classifyProviderError({ kind: 'openai_chat', body: 'malformed json' }).code).toBe('malformed_response');
  });

  it.each([
    [{ aborted: true }, 'cancelled'], [{ message: 'network request failed' }, 'network_offline'], [{ message: 'request timed out' }, 'timeout'],
    [{ message: 'TLS certificate invalid' }, 'tls_error'], [{ body: 'model is loading' }, 'model_loading'],
    [{ status: 400, body: 'unknown field' }, 'invalid_parameter'], [{ body: 'something entirely new' }, 'unknown'],
  ] as const)('covers transport and fallback failure %j', (patch, code) => {
    expect(classifyProviderError({ kind: 'openai_chat', ...patch })).toEqual(expect.objectContaining({ code }));
  });
});

describe('diagnostic redaction', () => {
  it('redacts known headers, bearer tokens, object keys, and supplied secrets', () => {
    expect(redactHeaders({ Authorization: 'Bearer secret', Accept: 'json' })).toEqual({ Authorization: '••••••••', Accept: 'json' });
    expect(redactText('Authorization: Bearer abcdef and custom-value', ['custom-value'])).not.toContain('abcdef');
    expect(redactDiagnostic({ api_key: 'secret', nested: { ok: true } })).toEqual({ api_key: '••••••••', nested: { ok: true } });
  });
});
