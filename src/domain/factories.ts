import * as Crypto from 'expo-crypto';
import { createDefaultCapabilities, createDefaultLimits } from './modelConfig';
import type { Conversation, CredentialProfile, Model, Provider, ProviderKind } from './types';

const now = () => new Date().toISOString();
export const createId = () => Crypto.randomUUID();

export function createProvider(kind: ProviderKind, displayName: string, baseUrl: string): Provider {
  const timestamp = now();
  return {
    id: createId(),
    displayName,
    kind,
    baseUrl,
    icon: { type: 'logo', value: kind.includes('ollama') ? 'ollama' : kind === 'openai_chat' ? 'openai' : 'meta' },
    lastCredentialId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createCredential(providerId: string, displayName: string): CredentialProfile {
  const timestamp = now();
  return {
    id: createId(),
    providerId,
    displayName,
    apiKeyRef: null,
    organizationRef: null,
    projectRef: null,
    headers: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createModel(provider: Provider, wireId: string, displayName = wireId): Model {
  const timestamp = now();
  return {
    id: createId(),
    providerId: provider.id,
    wireId,
    displayName,
    description: '',
    icon: provider.icon,
    enabled: true,
    favorite: false,
    sortOrder: 0,
    capabilities: createDefaultCapabilities(provider.kind),
    limits: createDefaultLimits(provider.kind),
    defaults: {
      systemPrompt: '',
      temperature: null,
      maxOutputTokens: null,
      stopSequences: [],
      reasoningMode: 'provider_default',
    },
    rawRequestOverrides: {},
    compatibilityNotes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createConversation(modelId: string | null = null): Conversation {
  const timestamp = now();
  return {
    id: createId(),
    title: 'New conversation',
    selectedModelId: modelId,
    selectedCredentialId: null,
    systemPrompt: '',
    temperature: null,
    maxOutputTokens: null,
    stopSequences: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
