import type {
  CapabilitySource,
  ConfigurableValue,
  Model,
  ModelCapabilities,
  ModelLimits,
  ModelMetadataPatch,
  ProviderKind,
} from './types';

const automatic = <T>(value: T, source: CapabilitySource = 'unknown'): ConfigurableValue<T> => ({
  value,
  mode: 'automatic',
  source,
});

export function createDefaultCapabilities(kind: ProviderKind): ModelCapabilities {
  const isOllamaNative = kind === 'ollama_native';
  const isLlama = kind === 'llama_cpp';
  return {
    text: automatic(true, 'preset'),
    image: automatic(false),
    audio: automatic(false),
    video: automatic(false),
    streaming: automatic(true, 'preset'),
    reasoning: automatic(isOllamaNative || isLlama, 'preset'),
    systemMessages: automatic(true, 'preset'),
    stopSequences: automatic(true, 'preset'),
    temperature: automatic(true, 'preset'),
    maxOutputTokens: automatic(true, 'preset'),
    usageReporting: automatic(kind !== 'ollama_openai_chat', 'preset'),
    structuredOutput: automatic(false),
    toolCallRecognition: automatic(false),
  };
}

export function createDefaultLimits(kind: ProviderKind): ModelLimits {
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  return {
    contextWindow: automatic(null),
    maxOutputTokens: automatic(null),
    maxAttachmentCount: automatic(null),
    maxFileBytes: automatic(null),
    maxRequestBytes: automatic(null),
    imageMimeTypes: automatic(imageTypes, 'preset'),
    audioMimeTypes: automatic(kind === 'llama_cpp' ? ['audio/mpeg', 'audio/wav', 'audio/flac'] : [], 'preset'),
    videoMimeTypes: automatic(kind === 'llama_cpp' ? ['video/mp4', 'video/webm'] : [], 'preset'),
    acceptsRemoteUrls: automatic(kind !== 'ollama_native', 'preset'),
    acceptsDataUrls: automatic(kind !== 'ollama_native', 'preset'),
    resendsMediaInHistory: automatic(true, 'preset'),
  };
}

export function applyDetectedMetadata(model: Model, patch: ModelMetadataPatch, detectedAt = new Date().toISOString()): Model {
  const capabilities = { ...model.capabilities };
  for (const [key, value] of Object.entries(patch.capabilities ?? {}) as [keyof ModelCapabilities, boolean][]) {
    if (capabilities[key].mode === 'automatic') {
      capabilities[key] = { value, mode: 'automatic', source: 'detected', detectedAt };
    }
  }

  const limits = { ...model.limits };
  for (const [key, value] of Object.entries(patch.limits ?? {}) as [keyof ModelLimits, ModelLimits[keyof ModelLimits]['value']][]) {
    if (limits[key].mode === 'automatic') {
      (limits as Record<string, ConfigurableValue<unknown>>)[key] = {
        value,
        mode: 'automatic',
        source: 'detected',
        detectedAt,
      };
    }
  }
  return { ...model, capabilities, limits, updatedAt: detectedAt };
}

export function setManualCapability<K extends keyof ModelCapabilities>(
  model: Model,
  key: K,
  value: ModelCapabilities[K]['value'],
): Model {
  return {
    ...model,
    capabilities: {
      ...model.capabilities,
      [key]: { value, mode: value ? 'supported' : 'unsupported', source: 'manual' },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function resetCapabilityToAutomatic<K extends keyof ModelCapabilities>(model: Model, key: K): Model {
  const current = model.capabilities[key];
  return {
    ...model,
    capabilities: {
      ...model.capabilities,
      [key]: { value: current.value, mode: 'automatic', source: 'unknown' },
    },
    updatedAt: new Date().toISOString(),
  };
}

export const PROTECTED_REQUEST_KEYS = new Set([
  'model',
  'messages',
  'stream',
  'input',
  'authorization',
  'api_key',
  'apiKey',
  'temperature',
  'max_tokens',
  'max_completion_tokens',
  'stop',
]);

export interface RawOverrideValidation {
  valid: boolean;
  errors: string[];
}

export function validateRawRequestOverrides(value: unknown): RawOverrideValidation {
  const errors: string[] = [];
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return { valid: false, errors: ['Advanced request parameters must be a JSON object.'] };
  }
  for (const key of Object.keys(value)) {
    if (PROTECTED_REQUEST_KEYS.has(key)) {
      errors.push(`“${key}” is managed by Sal. Use its structured setting instead.`);
    }
  }
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 64_000) errors.push('Advanced request parameters must be smaller than 64 KB.');
  } catch {
    errors.push('Advanced request parameters must contain only JSON-serializable values.');
  }
  return { valid: errors.length === 0, errors };
}

export function mergeRequestBody(
  structural: Record<string, unknown>,
  adapterDefaults: Record<string, unknown>,
  structured: Record<string, unknown>,
  chatOverrides: Record<string, unknown>,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const validation = validateRawRequestOverrides(raw);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  return { ...adapterDefaults, ...structured, ...chatOverrides, ...raw, ...structural };
}
