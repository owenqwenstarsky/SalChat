import type { SettingsDestination } from '@/domain/configError';
import type { ProviderKind } from '@/domain/types';
import { redactText } from './redaction';

export type ProviderErrorCode =
  | 'network_offline'
  | 'connection_refused'
  | 'timeout'
  | 'tls_error'
  | 'authentication'
  | 'authorization'
  | 'rate_limit'
  | 'quota'
  | 'model_missing'
  | 'model_loading'
  | 'context_length'
  | 'unsupported_media'
  | 'invalid_parameter'
  | 'protocol_mismatch'
  | 'malformed_response'
  | 'server_error'
  | 'cancelled'
  | 'unknown';

export interface ProviderFailure {
  code: ProviderErrorCode;
  title: string;
  guidance: string;
  retryable: boolean;
  status: number | null;
  providerMessage: string | null;
  requestId: string | null;
}

export interface ErrorContext {
  kind: ProviderKind;
  status?: number | undefined;
  message?: string | undefined;
  body?: string | undefined;
  requestId?: string | undefined;
  aborted?: boolean | undefined;
}

export function classifyProviderError(context: ErrorContext): ProviderFailure {
  const raw = `${context.message ?? ''} ${context.body ?? ''}`.trim();
  const lower = raw.toLowerCase();
  const status = context.status ?? null;
  const base = { status, providerMessage: raw ? redactText(raw).slice(0, 4000) : null, requestId: context.requestId ?? null };

  if (context.aborted) return { ...base, code: 'cancelled', title: 'Response stopped', guidance: 'The partial response has been kept. Retry when you are ready.', retryable: true };
  if (/network request failed|failed to fetch|offline/.test(lower)) return { ...base, code: 'network_offline', title: 'Provider unreachable', guidance: lanGuidance(context.kind), retryable: true };
  if (/econnrefused|connection refused/.test(lower)) return { ...base, code: 'connection_refused', title: 'Connection refused', guidance: lanGuidance(context.kind), retryable: true };
  if (/timeout|timed out/.test(lower)) return { ...base, code: 'timeout', title: 'Provider timed out', guidance: 'Check the provider, model load, and network, then try again.', retryable: true };
  if (/certificate|ssl|tls/.test(lower)) return { ...base, code: 'tls_error', title: 'Secure connection failed', guidance: 'Check the provider certificate and device clock. Sal will not bypass invalid public TLS.', retryable: false };
  if (status === 401 || /invalid api key|authentication/.test(lower)) return { ...base, code: 'authentication', title: 'Account not authenticated', guidance: 'Choose the correct account and re-enter its API key or authentication headers.', retryable: false };
  if (status === 403) return { ...base, code: 'authorization', title: 'Account lacks access', guidance: 'Check the selected account, project or organization, and model permissions.', retryable: false };
  if (status === 429 && /quota|credit|billing/.test(lower)) return { ...base, code: 'quota', title: 'Account quota exhausted', guidance: 'Review billing or select a different account explicitly.', retryable: false };
  if (status === 429) return { ...base, code: 'rate_limit', title: 'Provider is rate limiting requests', guidance: 'Wait before retrying or explicitly choose another account.', retryable: true };
  if (/model.*(not found|does not exist)|pull model|unknown model/.test(lower)) return { ...base, code: 'model_missing', title: 'Model not available', guidance: context.kind.includes('ollama') ? 'Pull the model in Ollama or correct its wire model ID.' : 'Correct the model ID or confirm this account has access.', retryable: false };
  if (/loading model|model is loading|load model/.test(lower)) return { ...base, code: 'model_loading', title: 'Model is still loading', guidance: 'Wait for the provider to finish loading the model, then retry.', retryable: true };
  if (/context.*(length|window)|too many tokens|prompt is too long/.test(lower)) return { ...base, code: 'context_length', title: 'Conversation exceeds the context window', guidance: 'Start a new chat, fork from a later message, or correct the model context-window setting.', retryable: false };
  if (/image|audio|video|mime|multimodal|mmproj/.test(lower) && /unsupported|invalid|missing|cannot/.test(lower)) return { ...base, code: 'unsupported_media', title: 'Media is not supported', guidance: context.kind === 'llama_cpp' ? 'Check the model capability settings and ensure llama.cpp was started with the required multimodal projector.' : 'Check the model capability and accepted media-format settings.', retryable: false };
  if (/\/api\/chat|\/v1\/chat\/completions|not found/.test(lower) && status === 404) return { ...base, code: 'protocol_mismatch', title: 'Provider API type does not match', guidance: protocolGuidance(context.kind), retryable: false };
  if (status === 400 || /invalid parameter|unknown field/.test(lower)) return { ...base, code: 'invalid_parameter', title: 'Provider rejected a setting', guidance: 'Review the model generation settings and advanced request parameters.', retryable: false };
  if (status !== null && status >= 500) return { ...base, code: 'server_error', title: 'Provider failed to generate', guidance: 'Inspect the provider logs and the redacted response details, then retry.', retryable: true };
  if (/json|sse|ndjson|unexpected end|malformed/.test(lower)) return { ...base, code: 'malformed_response', title: 'Provider returned an unreadable response', guidance: 'Confirm the provider API type and version. The raw redacted response is available below.', retryable: false };
  return { ...base, code: 'unknown', title: 'Provider request failed', guidance: 'Review the account, model configuration, and redacted provider details.', retryable: false };
}

export function destinationForProviderError(
  code: string,
  context: { modelId: string; providerId: string },
): SettingsDestination | null {
  switch (code) {
    case 'unsupported_media':
      return { kind: 'model', modelId: context.modelId, focus: 'capabilities' };
    case 'context_length':
      return { kind: 'model', modelId: context.modelId, focus: 'limits' };
    case 'invalid_parameter':
      return { kind: 'model', modelId: context.modelId, focus: 'advanced' };
    case 'model_missing':
      return { kind: 'model', modelId: context.modelId };
    case 'authentication':
    case 'authorization':
    case 'quota':
    case 'protocol_mismatch':
    case 'connection_refused':
    case 'network_offline':
    case 'tls_error':
      return { kind: 'provider', providerId: context.providerId };
    default:
      return null;
  }
}

function lanGuidance(kind: ProviderKind): string {
  if (kind.includes('ollama')) return 'Make sure Ollama is running, bound to the LAN interface, and that the phone uses the computer’s LAN address instead of localhost.';
  if (kind === 'llama_cpp') return 'Make sure llama-server is running with a LAN-accessible host and that the phone can reach its port.';
  if (kind === 'litellm') return 'Make sure the LiteLLM proxy is running, bound to the LAN interface, and that the phone uses the computer’s LAN address instead of localhost.';
  return 'Check the provider URL, internet connection, DNS, and local-network permission.';
}

function protocolGuidance(kind: ProviderKind): string {
  if (kind === 'ollama_native') return 'This provider expects Ollama’s native /api/chat route. Choose Ollama (Chat Completions) for /v1/chat/completions.';
  if (kind === 'ollama_openai_chat') return 'This provider expects Ollama’s /v1/chat/completions compatibility route. Choose Ollama for native /api/chat.';
  if (kind === 'litellm') return 'This provider expects LiteLLM’s OpenAI-compatible /v1/chat/completions route. Confirm the proxy URL and that the server is the LiteLLM proxy, not a provider dashboard.';
  return 'Verify the base URL and that the server exposes /v1/chat/completions.';
}
