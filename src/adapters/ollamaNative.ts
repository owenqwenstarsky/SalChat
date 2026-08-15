import { mergeRequestBody } from '@/domain/modelConfig';
import type { Model, ModelMetadataPatch, Provider } from '@/domain/types';
import { classifyProviderError } from '@/network/errors';
import { redactHeaders } from '@/network/redaction';
import { NdjsonParser } from '@/network/streams';
import { joinProviderPath } from '@/network/urlPolicy';
import { attachmentParts, contextFallbackMessage, decodeResponse, messageText, providerHeaders, structuredSettings, systemPrompt } from './shared';
import type { AdapterEvent, ChatRequest, ConnectionResult, DiscoveredModel, ProviderAdapter, RequestPreview, ResolvedCredential } from './types';

interface OllamaChunk {
  message?: { content?: string; thinking?: string; tool_calls?: { function?: { name?: string; arguments?: unknown } }[] };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  error?: string;
}

export class OllamaNativeAdapter implements ProviderAdapter {
  async testConnection(provider: Provider, credential: ResolvedCredential, signal?: AbortSignal): Promise<ConnectionResult> {
    const started = Date.now();
    try {
      const response = await fetch(joinProviderPath(provider.baseUrl, '/api/tags'), { headers: credential.headers, signal: signal ?? null });
      if (!response.ok) return { ok: false, latencyMs: Date.now() - started, message: 'Ollama rejected the connection test.', failure: await failureFromResponse(provider, response) };
      return { ok: true, latencyMs: Date.now() - started, message: 'Ollama is ready.' };
    } catch (error) {
      const failure = classifyProviderError({ kind: provider.kind, message: error instanceof Error ? error.message : String(error), aborted: signal?.aborted });
      return { ok: false, latencyMs: Date.now() - started, message: failure.title, failure };
    }
  }

  async listModels(provider: Provider, credential: ResolvedCredential, signal?: AbortSignal): Promise<DiscoveredModel[]> {
    const response = await fetch(joinProviderPath(provider.baseUrl, '/api/tags'), { headers: credential.headers, signal: signal ?? null });
    if (!response.ok) throw new Error((await failureFromResponse(provider, response)).guidance);
    const payload = (await response.json()) as { models?: { name?: string; model?: string }[] };
    const results: DiscoveredModel[] = [];
    for (const item of payload.models ?? []) {
      const id = item.model ?? item.name;
      if (!id) continue;
      results.push({ wireId: id, displayName: id, metadata: {} });
    }
    return results;
  }

  async inspectModel(provider: Provider, model: Model, credential: ResolvedCredential, signal?: AbortSignal): Promise<ModelMetadataPatch> {
    const response = await fetch(joinProviderPath(provider.baseUrl, '/api/show'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...credential.headers }, body: JSON.stringify({ model: model.wireId }), signal: signal ?? null,
    });
    if (!response.ok) return {};
    const payload = (await response.json()) as { capabilities?: string[]; model_info?: Record<string, unknown> };
    const caps = payload.capabilities ?? [];
    const contextEntry = Object.entries(payload.model_info ?? {}).find(([key]) => key.endsWith('.context_length'));
    return {
      capabilities: {
        image: caps.includes('vision'),
        reasoning: caps.includes('thinking'),
        toolCallRecognition: caps.includes('tools'),
      },
      ...(typeof contextEntry?.[1] === 'number' ? { limits: { contextWindow: contextEntry[1] } } : {}),
    };
  }

  private requestBody(request: ChatRequest): Record<string, unknown> {
    const prompt = systemPrompt(request);
    const messages = request.messages.map((message) => {
      const files = attachmentParts(message, request.attachments).filter((file) => file.mimeType.startsWith('image/'));
      return { role: message.role, content: messageText(message), ...(files.length ? { images: files.map((file) => file.base64) } : {}) };
    });
    messages.unshift(...contextFallbackMessage(request));
    if (prompt && request.model.capabilities.systemMessages.value) messages.unshift({ role: 'system', content: prompt });
    const generic = structuredSettings(request);
    const options = {
      ...(generic.temperature !== undefined ? { temperature: generic.temperature } : {}),
      ...(generic.max_completion_tokens !== undefined ? { num_predict: generic.max_completion_tokens } : {}),
      ...(generic.stop !== undefined ? { stop: generic.stop } : {}),
    };
    return mergeRequestBody({ model: request.model.wireId, messages, stream: true }, {}, {}, {}, { options, ...request.model.rawRequestOverrides });
  }

  previewRequest(request: ChatRequest): RequestPreview {
    return { url: joinProviderPath(request.provider.baseUrl, '/api/chat'), headers: redactHeaders(providerHeaders(request)), body: { ...this.requestBody(request), messages: '[message content redacted]' } };
  }

  async *streamChat(request: ChatRequest): AsyncGenerator<AdapterEvent> {
    const response = await fetch(joinProviderPath(request.provider.baseUrl, '/api/chat'), {
      method: 'POST', headers: providerHeaders(request), body: JSON.stringify(this.requestBody(request)), signal: request.signal ?? null,
    });
    if (!response.ok) throw new Error((await failureFromResponse(request.provider, response)).providerMessage ?? `HTTP ${response.status}`);
    const parser = new NdjsonParser<OllamaChunk>();
    for await (const text of decodeResponse(response)) for (const chunk of parser.push(text)) yield* ollamaEvents(chunk);
    for (const chunk of parser.finish()) yield* ollamaEvents(chunk);
  }
}

function* ollamaEvents(chunk: OllamaChunk): Generator<AdapterEvent> {
  if (chunk.error) throw new Error(chunk.error);
  if (chunk.message?.thinking) yield { type: 'reasoning_delta', text: chunk.message.thinking };
  if (chunk.message?.content) yield { type: 'text_delta', text: chunk.message.content };
  for (const call of chunk.message?.tool_calls ?? []) if (call.function?.name) yield { type: 'tool_call', name: call.function.name, arguments: call.function.arguments ?? {} };
  if (chunk.done) {
    if (chunk.prompt_eval_count !== undefined || chunk.eval_count !== undefined) yield { type: 'usage', promptTokens: chunk.prompt_eval_count ?? null, completionTokens: chunk.eval_count ?? null, totalTokens: (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0) };
    yield { type: 'finish', reason: chunk.done_reason ?? null, ...(chunk.total_duration ? { providerData: { totalDurationNs: chunk.total_duration } } : {}) };
  }
}

async function failureFromResponse(provider: Provider, response: Response) {
  return classifyProviderError({ kind: provider.kind, status: response.status, body: await response.text() });
}
