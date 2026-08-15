import type {
  Conversation,
  CredentialProfile,
  GenerationDefaults,
  Message,
  Model,
  ModelMetadataPatch,
  Provider,
} from '@/domain/types';
import type { ProviderFailure } from '@/network/errors';

export interface ResolvedCredential {
  profile: CredentialProfile | null;
  headers: Record<string, string>;
}

export interface ResolvedAttachment {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
}

export interface ChatRequest {
  provider: Provider;
  model: Model;
  conversation: Conversation;
  messages: Message[];
  credential: ResolvedCredential;
  attachments: Record<string, ResolvedAttachment>;
  overrides?: Partial<GenerationDefaults>;
  signal?: AbortSignal;
}

export type AdapterEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call'; name: string; arguments: unknown }
  | { type: 'usage'; promptTokens: number | null; completionTokens: number | null; totalTokens: number | null }
  | { type: 'warning'; message: string }
  | { type: 'finish'; reason: string | null; providerData?: Record<string, unknown> };

export interface DiscoveredModel {
  wireId: string;
  displayName: string;
  metadata: ModelMetadataPatch;
}

export interface ConnectionResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  failure?: ProviderFailure;
}

export interface RequestPreview {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface ProviderAdapter {
  testConnection(provider: Provider, credential: ResolvedCredential, signal?: AbortSignal): Promise<ConnectionResult>;
  listModels(provider: Provider, credential: ResolvedCredential, signal?: AbortSignal): Promise<DiscoveredModel[]>;
  inspectModel(provider: Provider, model: Model, credential: ResolvedCredential, signal?: AbortSignal): Promise<ModelMetadataPatch>;
  previewRequest(request: ChatRequest): RequestPreview;
  streamChat(request: ChatRequest): AsyncGenerator<AdapterEvent>;
}
