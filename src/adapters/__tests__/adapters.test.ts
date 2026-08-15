import { LlamaCppAdapter } from '../llamaCpp';
import { OllamaNativeAdapter } from '../ollamaNative';
import { OllamaOpenAiAdapter } from '../ollamaOpenAi';
import { OpenAiChatAdapter } from '../openaiChat';
import { adapterFor } from '..';
import { createDefaultCapabilities, createDefaultLimits } from '@/domain/modelConfig';
import type { ChatRequest } from '../types';

function request(kind: 'openai_chat' | 'ollama_native' | 'llama_cpp'): ChatRequest {
  const now = '2026-01-01';
  return {
    provider: { id: 'p', displayName: 'Provider', kind, baseUrl: kind === 'ollama_native' ? 'http://192.168.1.2:11434' : 'https://example.com/v1', icon: { type: 'emoji', value: 'P' }, lastCredentialId: null, createdAt: now, updatedAt: now },
    model: { id: 'm', providerId: 'p', wireId: 'model-x', displayName: 'Model X', description: '', icon: { type: 'emoji', value: 'M' }, enabled: true, favorite: false, sortOrder: 0, capabilities: { ...createDefaultCapabilities(kind), image: { value: true, mode: 'supported', source: 'manual' }, audio: { value: true, mode: 'supported', source: 'manual' }, video: { value: true, mode: 'supported', source: 'manual' } }, limits: createDefaultLimits(kind), defaults: { systemPrompt: 'Be useful', temperature: 0.4, maxOutputTokens: 100, stopSequences: [], reasoningMode: 'provider_default' }, rawRequestOverrides: { top_p: 0.9 }, compatibilityNotes: '', createdAt: now, updatedAt: now },
    conversation: { id: 'c', title: 'Chat', selectedModelId: 'm', selectedCredentialId: null, systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [], createdAt: now, updatedAt: now },
    messages: [{ id: 'msg', conversationId: 'c', role: 'user', status: 'complete', parts: [{ type: 'text', text: 'Look' }, { type: 'attachment', attachmentId: 'image', mimeType: 'image/png', name: 'x.png' }, { type: 'attachment', attachmentId: 'audio', mimeType: 'audio/wav', name: 'x.wav' }, { type: 'attachment', attachmentId: 'video', mimeType: 'video/mp4', name: 'x.mp4' }], createdAt: now, updatedAt: now }],
    credential: { profile: null, headers: { Authorization: 'Bearer secret' } },
    attachments: { image: { id: 'image', name: 'x.png', mimeType: 'image/png', base64: 'IMAGE' }, audio: { id: 'audio', name: 'x.wav', mimeType: 'audio/wav', base64: 'AUDIO' }, video: { id: 'video', name: 'x.mp4', mimeType: 'video/mp4', base64: 'VIDEO' } },
  };
}

function jsonResponse(payload: unknown): Response {
  return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => payload, text: async () => JSON.stringify(payload), body: null } as unknown as Response;
}

describe('adapter wire formats', () => {
  afterEach(() => jest.restoreAllMocks());

  it('serializes OpenAI images and audio while redacting previews', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }));
    const events = [];
    for await (const event of new OpenAiChatAdapter().streamChat(request('openai_chat'))) events.push(event);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.messages[1].content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image_url' }), expect.objectContaining({ type: 'input_audio' })]));
    expect(body.top_p).toBe(0.9);
    expect(events).toContainEqual({ type: 'text_delta', text: 'ok' });
    expect(new OpenAiChatAdapter().previewRequest(request('openai_chat')).headers.Authorization).toBe('••••••••');
  });

  it('uses Ollama native message images and options', async () => {
    const response = '{"message":{"thinking":"h","content":"ok"},"done":false}\n{"done":true,"eval_count":2,"prompt_eval_count":3}\n';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, headers: new Headers(), body: null, text: async () => response } as unknown as Response);
    const events = [];
    for await (const event of new OllamaNativeAdapter().streamChat(request('ollama_native'))) events.push(event);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.messages[1].images).toEqual(['IMAGE']);
    expect(body.options.temperature).toBe(0.4);
    expect(events).toContainEqual({ type: 'reasoning_delta', text: 'h' });
    expect(events).toContainEqual({ type: 'usage', promptTokens: 3, completionTokens: 2, totalTokens: 5 });
  });

  it('serializes llama.cpp image, audio, and video extensions', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
    const events = [];
    for await (const event of new LlamaCppAdapter().streamChat(request('llama_cpp'))) events.push(event);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.messages[1].content.map((part: { type: string }) => part.type)).toEqual(['text', 'image_url', 'input_audio', 'input_video']);
    expect(events).toContainEqual({ type: 'finish', reason: 'stop' });
  });

  it('routes every provider kind to its dedicated adapter', () => {
    expect(adapterFor('openai_chat')).toBeInstanceOf(OpenAiChatAdapter);
    expect(adapterFor('ollama_native')).toBeInstanceOf(OllamaNativeAdapter);
    expect(adapterFor('ollama_openai_chat')).toBeInstanceOf(OllamaOpenAiAdapter);
    expect(adapterFor('llama_cpp')).toBeInstanceOf(LlamaCppAdapter);
  });
});

describe('adapter discovery and health checks', () => {
  afterEach(() => jest.restoreAllMocks());

  it('discovers OpenAI-format models and reads compatible metadata', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: [{ id: 'vision-model', meta: { multimodal: true, n_ctx_train: 8192 } }] }));
    const input = request('openai_chat');
    const adapter = new OpenAiChatAdapter();
    await expect(adapter.testConnection(input.provider, input.credential)).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(adapter.listModels(input.provider, input.credential)).resolves.toEqual([{ wireId: 'vision-model', displayName: 'vision-model', metadata: { capabilities: { image: true }, limits: { contextWindow: 8192 } } }]);
  });

  it('returns a classified failure for a rejected connection and thrown network error', async () => {
    const adapter = new OpenAiChatAdapter();
    const input = request('openai_chat');
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers(), text: async () => 'invalid API key' } as unknown as Response);
    await expect(adapter.testConnection(input.provider, input.credential)).resolves.toEqual(expect.objectContaining({ ok: false, failure: expect.objectContaining({ code: 'authentication' }) }));
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network request failed'));
    await expect(adapter.testConnection(input.provider, input.credential)).resolves.toEqual(expect.objectContaining({ ok: false, failure: expect.objectContaining({ code: 'network_offline' }) }));
  });

  it('discovers and inspects Ollama native models', async () => {
    const adapter = new OllamaNativeAdapter();
    const input = request('ollama_native');
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ models: [{ model: 'gemma:latest' }, { name: 'llama:latest' }, {}] }))
      .mockResolvedValueOnce(jsonResponse({ capabilities: ['vision', 'thinking', 'tools'], model_info: { 'gemma.context_length': 32_768 } }));
    await expect(adapter.listModels(input.provider, input.credential)).resolves.toEqual([
      { wireId: 'gemma:latest', displayName: 'gemma:latest', metadata: {} },
      { wireId: 'llama:latest', displayName: 'llama:latest', metadata: {} },
    ]);
    await expect(adapter.inspectModel(input.provider, input.model, input.credential)).resolves.toEqual(expect.objectContaining({ capabilities: { image: true, reasoning: true, toolCallRecognition: true }, limits: { contextWindow: 32_768 } }));
  });

  it('enriches Ollama OpenAI models when native inspection is available and tolerates failure', async () => {
    const adapter = new OllamaOpenAiAdapter();
    const input = request('openai_chat');
    input.provider.kind = 'ollama_openai_chat';
    input.provider.baseUrl = 'http://192.168.1.2:11434/v1';
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ capabilities: ['vision'], model_info: {} })).mockRejectedValueOnce(new Error('native route absent'));
    await expect(adapter.inspectModel(input.provider, input.model, input.credential)).resolves.toEqual(expect.objectContaining({ capabilities: expect.objectContaining({ image: true }) }));
    await expect(adapter.inspectModel(input.provider, input.model, input.credential)).resolves.toEqual({});
  });
});
