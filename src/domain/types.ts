export type ProviderKind =
  | 'openai_chat'
  | 'ollama_native'
  | 'ollama_openai_chat'
  | 'llama_cpp'
  | 'litellm';

export type CapabilityMode = 'automatic' | 'supported' | 'unsupported';
export type CapabilitySource = 'detected' | 'preset' | 'manual' | 'unknown';
export type InputModality = 'text' | 'image' | 'audio' | 'video';

export interface ConfigurableValue<T> {
  value: T;
  mode: CapabilityMode;
  source: CapabilitySource;
  detectedAt?: string;
  note?: string;
}

export interface ModelCapabilities {
  text: ConfigurableValue<boolean>;
  image: ConfigurableValue<boolean>;
  audio: ConfigurableValue<boolean>;
  video: ConfigurableValue<boolean>;
  streaming: ConfigurableValue<boolean>;
  reasoning: ConfigurableValue<boolean>;
  systemMessages: ConfigurableValue<boolean>;
  stopSequences: ConfigurableValue<boolean>;
  temperature: ConfigurableValue<boolean>;
  maxOutputTokens: ConfigurableValue<boolean>;
  usageReporting: ConfigurableValue<boolean>;
  structuredOutput: ConfigurableValue<boolean>;
  toolCallRecognition: ConfigurableValue<boolean>;
}

export interface ModelLimits {
  contextWindow: ConfigurableValue<number | null>;
  maxOutputTokens: ConfigurableValue<number | null>;
  maxAttachmentCount: ConfigurableValue<number | null>;
  maxFileBytes: ConfigurableValue<number | null>;
  maxRequestBytes: ConfigurableValue<number | null>;
  imageMimeTypes: ConfigurableValue<string[]>;
  audioMimeTypes: ConfigurableValue<string[]>;
  videoMimeTypes: ConfigurableValue<string[]>;
  acceptsRemoteUrls: ConfigurableValue<boolean>;
  acceptsDataUrls: ConfigurableValue<boolean>;
  resendsMediaInHistory: ConfigurableValue<boolean>;
}

export interface GenerationDefaults {
  systemPrompt: string;
  temperature: number | null;
  maxOutputTokens: number | null;
  stopSequences: string[];
  reasoningMode: 'provider_default' | 'enabled' | 'disabled';
}

export type IconSpec =
  | { type: 'logo'; value: BrandLogo }
  | { type: 'emoji'; value: string }
  | { type: 'asset'; value: string };

export type BrandLogo = 'openai' | 'anthropic' | 'ollama' | 'meta' | 'litellm' | 'generic';

export interface Provider {
  id: string;
  displayName: string;
  kind: ProviderKind;
  baseUrl: string;
  icon: IconSpec;
  lastCredentialId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialHeader {
  name: string;
  secretRef: string;
}

export interface CredentialProfile {
  id: string;
  providerId: string;
  displayName: string;
  apiKeyRef: string | null;
  organizationRef: string | null;
  projectRef: string | null;
  headers: CredentialHeader[];
  createdAt: string;
  updatedAt: string;
}

export interface Model {
  id: string;
  providerId: string;
  wireId: string;
  displayName: string;
  description: string;
  icon: IconSpec;
  enabled: boolean;
  favorite: boolean;
  sortOrder: number;
  capabilities: ModelCapabilities;
  limits: ModelLimits;
  defaults: GenerationDefaults;
  rawRequestOverrides: Record<string, unknown>;
  compatibilityNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentBlob {
  id: string;
  sha256: string;
  mimeType: string;
  originalName: string;
  byteSize: number;
  storedUri: string;
  modality: Exclude<InputModality, 'text'>;
  createdAt: string;
  referenceCount: number;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'attachment'; attachmentId: string; mimeType: string; name: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; name: string; arguments: unknown };

export interface Message {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant';
  parts: MessagePart[];
  status: 'complete' | 'streaming' | 'interrupted' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface GenerationProvenance {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  wireModelId: string;
  credentialId: string | null;
  credentialName: string | null;
}

export interface Generation {
  id: string;
  conversationId: string;
  messageId: string;
  provenance: GenerationProvenance;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  createdAt: string;
}

export type ContextMode = 'inherit' | 'automatic' | 'manual';

export interface ContextCheckpoint {
  summary: string;
  throughMessageId: string;
  revision: number;
  sourceMessageCount: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  provenance: GenerationProvenance;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  createdAt: string;
}

export interface ConversationContext {
  mode: ContextMode;
  note: string;
  pinnedMessageIds: string[];
  checkpoint: ContextCheckpoint | null;
}

export interface Conversation {
  id: string;
  title: string;
  selectedModelId: string | null;
  selectedCredentialId: string | null;
  systemPrompt: string;
  temperature: number | null;
  maxOutputTokens: number | null;
  stopSequences: string[];
  context: ConversationContext;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  reasoningVisibility: 'hidden' | 'collapsed' | 'expanded';
  colorScheme: 'system' | 'light' | 'dark';
  hapticsEnabled: boolean;
  diagnosticsIncludeProviderBody: boolean;
  contextManagementDefault: Exclude<ContextMode, 'inherit'>;
}

export interface ModelMetadataPatch {
  capabilities?: Partial<Record<keyof ModelCapabilities, boolean>>;
  limits?: Partial<{
    contextWindow: number | null;
    maxOutputTokens: number | null;
    maxAttachmentCount: number | null;
    maxFileBytes: number | null;
    maxRequestBytes: number | null;
    imageMimeTypes: string[];
    audioMimeTypes: string[];
    videoMimeTypes: string[];
    acceptsRemoteUrls: boolean;
    acceptsDataUrls: boolean;
    resendsMediaInHistory: boolean;
  }>;
}
