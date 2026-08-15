import { classifyProviderError, destinationForProviderError } from '../errors';
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

  it('provides LiteLLM-specific LAN guidance', () => {
    const failure = classifyProviderError({ kind: 'litellm', message: 'connection refused' });
    expect(failure.code).toBe('connection_refused');
    expect(failure.guidance).toContain('LiteLLM');
    expect(failure.guidance).toContain('LAN');
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

describe('provider error destinations', () => {
  const context = { modelId: 'm', providerId: 'p' };

  it.each([
    ['unsupported_media', { kind: 'model', modelId: 'm', focus: 'capabilities' }],
    ['context_length', { kind: 'model', modelId: 'm', focus: 'limits' }],
    ['invalid_parameter', { kind: 'model', modelId: 'm', focus: 'advanced' }],
    ['model_missing', { kind: 'model', modelId: 'm' }],
    ['authentication', { kind: 'provider', providerId: 'p' }],
    ['authorization', { kind: 'provider', providerId: 'p' }],
    ['quota', { kind: 'provider', providerId: 'p' }],
    ['protocol_mismatch', { kind: 'provider', providerId: 'p' }],
    ['connection_refused', { kind: 'provider', providerId: 'p' }],
    ['network_offline', { kind: 'provider', providerId: 'p' }],
    ['tls_error', { kind: 'provider', providerId: 'p' }],
  ] as const)('routes %s to settings', (code, destination) => {
    expect(destinationForProviderError(code, context)).toEqual(destination);
  });

  it.each(['timeout', 'rate_limit', 'model_loading', 'cancelled', 'server_error', 'malformed_response', 'unknown'] as const)(
    'leaves retryable or generic %s without a settings action',
    (code) => {
      expect(destinationForProviderError(code, context)).toBeNull();
    },
  );
});

describe('diagnostic redaction', () => {
  it('redacts known headers, bearer tokens, object keys, and supplied secrets', () => {
    expect(redactHeaders({ Authorization: 'Bearer secret', Accept: 'json' })).toEqual({ Authorization: '••••••••', Accept: 'json' });
    expect(redactText('Authorization: Bearer abcdef and custom-value', ['custom-value'])).not.toContain('abcdef');
    expect(redactDiagnostic({ api_key: 'secret', nested: { ok: true } })).toEqual({ api_key: '••••••••', nested: { ok: true } });
  });
});
