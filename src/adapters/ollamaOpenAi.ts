import type { Model, ModelMetadataPatch, Provider } from '@/domain/types';
import type { ResolvedCredential } from './types';
import { OpenAiChatAdapter } from './openaiChat';

export class OllamaOpenAiAdapter extends OpenAiChatAdapter {
  override async inspectModel(provider: Provider, model: Model, credential: ResolvedCredential, signal?: AbortSignal): Promise<ModelMetadataPatch> {
    const base = provider.baseUrl.replace(/\/v1\/?$/, '');
    try {
      const response = await fetch(`${base}/api/show`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...credential.headers }, body: JSON.stringify({ model: model.wireId }), signal: signal ?? null,
      });
      if (!response.ok) return {};
      const payload = (await response.json()) as { capabilities?: string[]; model_info?: Record<string, unknown> };
      const caps = payload.capabilities ?? [];
      const context = Object.entries(payload.model_info ?? {}).find(([key]) => key.endsWith('.context_length'))?.[1];
      return {
        capabilities: { image: caps.includes('vision'), reasoning: caps.includes('thinking'), toolCallRecognition: caps.includes('tools') },
        ...(typeof context === 'number' ? { limits: { contextWindow: context } } : {}),
      };
    } catch {
      return {};
    }
  }
}
