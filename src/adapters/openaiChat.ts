import { mergeRequestBody } from '@/domain/modelConfig';
import type { Message, Model, ModelMetadataPatch, Provider } from '@/domain/types';
import { classifyProviderError } from '@/network/errors';
import { redactHeaders } from '@/network/redaction';
import { SseParser } from '@/network/streams';
import { joinProviderPath } from '@/network/urlPolicy';
import { attachmentParts, dataUrl, decodeResponse, messageText, providerHeaders, structuredSettings, systemPrompt } from './shared';
import type { AdapterEvent, ChatRequest, ConnectionResult, DiscoveredModel, ProviderAdapter, RequestPreview, ResolvedCredential } from './types';

interface OpenAiChunk {
  choices?: {
    delta?: { content?: string; reasoning_content?: string; refusal?: string; tool_calls?: { function?: { name?: string; arguments?: string } }[] };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string; code?: string };
}

export class OpenAiChatAdapter implements ProviderAdapter {
  protected chatPath = '/v1/chat/completions';
  protected modelsPath = '/v1/models';

  async testConnection(provider: Provider, credential: ResolvedCredential, signal?: AbortSignal): Promise<ConnectionResult> {
    const started = Date.now();
    try {
      const response = await fetch(joinProviderPath(provider.baseUrl, this.modelsPath), { headers: credential.headers, signal: signal ?? null });
      if (!response.ok) return { ok: false, latencyMs: Date.now() - started, message: 'Provider rejected the connection test.', failure: await failureFromResponse(provider, response) };
      return { ok: true, latencyMs: Date.now() - started, message: 'Connection and account are ready.' };
    } catch (error) {
      const failure = classifyProviderError({ kind: provider.kind, message: error instanceof Error ? error.message : String(error), aborted: signal?.aborted });
      return { ok: false, latencyMs: Date.now() - started, message: failure.title, failure };
    }
  }

  async listModels(provider: Provider, credential: ResolvedCredential, signal?: AbortSignal): Promise<DiscoveredModel[]> {
    const response = await fetch(joinProviderPath(provider.baseUrl, this.modelsPath), { headers: credential.headers, signal: signal ?? null });
    if (!response.ok) throw new Error((await failureFromResponse(provider, response)).guidance);
    const payload = (await response.json()) as { data?: { id?: string; meta?: Record<string, unknown> }[] };
    return (payload.data ?? []).filter((item) => item.id).map((item) => ({ wireId: item.id!, displayName: item.id!, metadata: metadataFromOpenAiModel(item.meta) }));
  }

  async inspectModel(_provider: Provider, _model: Model, _credential: ResolvedCredential, _signal?: AbortSignal): Promise<ModelMetadataPatch> {
    return {};
  }

  protected serializeMessages(request: ChatRequest): unknown[] {
    const prompt = systemPrompt(request);
    const history = request.messages.map((message) => serializeOpenAiMessage(message, request));
    return prompt && request.model.capabilities.systemMessages.value ? [{ role: 'system', content: prompt }, ...history] : history;
  }

  protected requestBody(request: ChatRequest): Record<string, unknown> {
    const structural = { model: request.model.wireId, messages: this.serializeMessages(request), stream: true, stream_options: { include_usage: true } };
    return mergeRequestBody(structural, {}, structuredSettings(request), {}, request.model.rawRequestOverrides);
  }

  previewRequest(request: ChatRequest): RequestPreview {
    return { url: joinProviderPath(request.provider.baseUrl, this.chatPath), headers: redactHeaders(providerHeaders(request)), body: redactPreviewBody(this.requestBody(request)) };
  }

  async *streamChat(request: ChatRequest): AsyncGenerator<AdapterEvent> {
    const response = await fetch(joinProviderPath(request.provider.baseUrl, this.chatPath), {
      method: 'POST',
      headers: providerHeaders(request),
      body: JSON.stringify(this.requestBody(request)),
      signal: request.signal ?? null,
    });
    if (!response.ok) throw new Error((await failureFromResponse(request.provider, response)).providerMessage ?? `HTTP ${response.status}`);

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      const payload = (await response.json()) as OpenAiChunk;
      yield* eventsFromOpenAiChunk(payload);
      return;
    }
    const parser = new SseParser();
    for await (const text of decodeResponse(response)) {
      for (const event of parser.push(text)) {
        if (event.data === '[DONE]') continue;
        yield* eventsFromOpenAiChunk(JSON.parse(event.data) as OpenAiChunk);
      }
    }
    for (const event of parser.finish()) {
      if (event.data !== '[DONE]') yield* eventsFromOpenAiChunk(JSON.parse(event.data) as OpenAiChunk);
    }
  }
}

function serializeOpenAiMessage(message: Message, request: ChatRequest): Record<string, unknown> {
  const files = attachmentParts(message, request.attachments);
  const text = messageText(message);
  if (!files.length) return { role: message.role, content: text };
  const content: unknown[] = text ? [{ type: 'text', text }] : [];
  for (const file of files) {
    if (file.mimeType.startsWith('image/')) content.push({ type: 'image_url', image_url: { url: dataUrl(file), detail: 'auto' } });
    else if (file.mimeType.startsWith('audio/')) content.push({ type: 'input_audio', input_audio: { data: file.base64, format: audioFormat(file.mimeType) } });
  }
  return { role: message.role, content };
}

function audioFormat(mime: string): string {
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('flac')) return 'flac';
  return 'mp3';
}

function* eventsFromOpenAiChunk(chunk: OpenAiChunk): Generator<AdapterEvent> {
  if (chunk.error?.message) throw new Error(chunk.error.message);
  for (const choice of chunk.choices ?? []) {
    if (choice.delta?.reasoning_content) yield { type: 'reasoning_delta', text: choice.delta.reasoning_content };
    if (choice.delta?.content) yield { type: 'text_delta', text: choice.delta.content };
    if (choice.delta?.refusal) yield { type: 'warning', message: choice.delta.refusal };
    for (const call of choice.delta?.tool_calls ?? []) {
      if (call.function?.name) yield { type: 'tool_call', name: call.function.name, arguments: call.function.arguments ?? '' };
    }
    if (choice.finish_reason) yield { type: 'finish', reason: choice.finish_reason };
  }
  if (chunk.usage) yield { type: 'usage', promptTokens: chunk.usage.prompt_tokens ?? null, completionTokens: chunk.usage.completion_tokens ?? null, totalTokens: chunk.usage.total_tokens ?? null };
}

function metadataFromOpenAiModel(meta?: Record<string, unknown>): ModelMetadataPatch {
  if (!meta) return {};
  return {
    ...(typeof meta.multimodal === 'boolean' ? { capabilities: { image: meta.multimodal } } : {}),
    ...(typeof meta.n_ctx_train === 'number' ? { limits: { contextWindow: meta.n_ctx_train } } : {}),
  };
}

async function failureFromResponse(provider: Provider, response: Response) {
  const body = await response.text();
  return classifyProviderError({ kind: provider.kind, status: response.status, body, requestId: response.headers.get('x-request-id') ?? undefined });
}

function redactPreviewBody(body: Record<string, unknown>): Record<string, unknown> {
  return { ...body, messages: '[message content redacted]' };
}
