import type { Model, ModelMetadataPatch, Provider } from '@/domain/types';
import { joinProviderPath } from '@/network/urlPolicy';
import { OpenAiChatAdapter } from './openaiChat';
import type { DiscoveredModel, ResolvedCredential } from './types';

const CHAT_MODES = new Set(['chat', 'responses']);
const NON_CHAT_MODES = new Set([
  'embedding',
  'image_generation',
  'audio_speech',
  'audio_transcription',
  'moderation',
  'rerank',
]);

interface LiteLlmModelInfo {
  mode?: string;
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  supports_vision?: boolean;
  supports_audio_input?: boolean;
  supports_reasoning?: boolean;
  supports_function_calling?: boolean;
  supports_response_schema?: boolean;
  supports_system_messages?: boolean;
}

interface LiteLlmModelEntry {
  model_name?: string;
  model_info?: LiteLlmModelInfo;
}

export class LiteLlmAdapter extends OpenAiChatAdapter {
  override async listModels(provider: Provider, credential: ResolvedCredential, signal?: AbortSignal): Promise<DiscoveredModel[]> {
    const entries = await fetchModelInfo(provider, credential, signal);
    if (!entries) return super.listModels(provider, credential, signal);
    const seen = new Set<string>();
    const models: DiscoveredModel[] = [];
    for (const entry of entries) {
      const wireId = entry.model_name;
      if (!wireId || seen.has(wireId) || !isChatModel(entry.model_info)) continue;
      seen.add(wireId);
      models.push({ wireId, displayName: wireId, metadata: metadataFromLiteLlm(entry.model_info) });
    }
    return models;
  }

  override async inspectModel(provider: Provider, model: Model, credential: ResolvedCredential, signal?: AbortSignal): Promise<ModelMetadataPatch> {
    const entries = await fetchModelInfo(provider, credential, signal);
    if (!entries) return {};
    const match = entries.find((entry) => entry.model_name === model.wireId);
    return match ? metadataFromLiteLlm(match.model_info) : {};
  }
}

async function fetchModelInfo(
  provider: Provider,
  credential: ResolvedCredential,
  signal?: AbortSignal,
): Promise<LiteLlmModelEntry[] | null> {
  try {
    const response = await fetch(joinProviderPath(provider.baseUrl, '/v1/model/info'), {
      headers: credential.headers,
      signal: signal ?? null,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: LiteLlmModelEntry[] };
    return Array.isArray(payload.data) ? payload.data : null;
  } catch {
    return null;
  }
}

function isChatModel(info?: LiteLlmModelInfo): boolean {
  const mode = info?.mode;
  if (!mode) return true;
  if (CHAT_MODES.has(mode)) return true;
  return !NON_CHAT_MODES.has(mode);
}

function metadataFromLiteLlm(info?: LiteLlmModelInfo): ModelMetadataPatch {
  if (!info) return {};
  const capabilities: NonNullable<ModelMetadataPatch['capabilities']> = {};
  if (typeof info.supports_vision === 'boolean') capabilities.image = info.supports_vision;
  if (typeof info.supports_audio_input === 'boolean') capabilities.audio = info.supports_audio_input;
  if (typeof info.supports_reasoning === 'boolean') capabilities.reasoning = info.supports_reasoning;
  if (typeof info.supports_function_calling === 'boolean') capabilities.toolCallRecognition = info.supports_function_calling;
  if (typeof info.supports_response_schema === 'boolean') capabilities.structuredOutput = info.supports_response_schema;
  if (typeof info.supports_system_messages === 'boolean') capabilities.systemMessages = info.supports_system_messages;

  const contextWindow = info.max_input_tokens ?? info.max_tokens;
  const limits: NonNullable<ModelMetadataPatch['limits']> = {};
  if (typeof contextWindow === 'number') limits.contextWindow = contextWindow;
  if (typeof info.max_output_tokens === 'number') limits.maxOutputTokens = info.max_output_tokens;

  return {
    ...(Object.keys(capabilities).length ? { capabilities } : {}),
    ...(Object.keys(limits).length ? { limits } : {}),
  };
}
