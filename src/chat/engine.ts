import { adapterFor } from '@/adapters';
import type { AdapterEvent, ResolvedAttachment } from '@/adapters/types';
import { createId } from '@/domain/factories';
import type { Generation, Message, MessagePart } from '@/domain/types';
import { classifyProviderError } from '@/network/errors';
import { attachmentBase64 } from '@/storage/attachments';
import { resolveCredential } from '@/storage/secrets';
import { useSalStore } from '@/state/store';

const controllers = new Map<string, AbortController>();

export interface SendInput {
  conversationId: string;
  text: string;
  attachmentIds?: string[];
}

export async function sendMessage(input: SendInput): Promise<void> {
  const state = useSalStore.getState();
  const conversation = state.conversations.find((item) => item.id === input.conversationId);
  if (!conversation) throw new Error('Conversation not found.');
  const model = state.models.find((item) => item.id === conversation.selectedModelId);
  if (!model) throw new Error('Choose a model before sending.');
  const provider = state.providers.find((item) => item.id === model.providerId);
  if (!provider) throw new Error('The selected model provider no longer exists.');
  const credentialId = conversation.selectedCredentialId ?? provider.lastCredentialId;
  const credential = state.credentials.find((item) => item.id === credentialId) ?? null;
  if (state.credentials.some((item) => item.providerId === provider.id) && !credential) throw new Error('Choose an account for this provider before sending.');

  const selectedAttachments = (input.attachmentIds ?? []).map((id) => state.attachments.find((item) => item.id === id)).filter((item) => item !== undefined);
  validateAttachments(model, selectedAttachments);

  const timestamp = new Date().toISOString();
  const userMessage: Message = {
    id: createId(), conversationId: conversation.id, role: 'user', status: 'complete',
    parts: [
      ...(input.text.trim() ? [{ type: 'text' as const, text: input.text.trim() }] : []),
      ...selectedAttachments.map((item) => ({ type: 'attachment' as const, attachmentId: item.id, mimeType: item.mimeType, name: item.originalName })),
    ],
    createdAt: timestamp, updatedAt: timestamp,
  };
  const assistantMessage: Message = {
    id: createId(), conversationId: conversation.id, role: 'assistant', status: 'streaming', parts: [], createdAt: timestamp, updatedAt: timestamp,
  };
  await state.saveMessage(userMessage);
  await state.saveMessage(assistantMessage);

  if (conversation.title === 'New conversation' && input.text.trim()) {
    await state.saveConversation({ ...conversation, title: input.text.trim().replace(/\s+/g, ' ').slice(0, 52), updatedAt: timestamp });
  }

  const allMessages = [...useSalStore.getState().messages.filter((item) => item.conversationId === conversation.id && item.id !== assistantMessage.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))];
  const attachmentIds = new Set(allMessages.flatMap((message) => message.parts.filter((part) => part.type === 'attachment').map((part) => part.attachmentId)));
  const resolvedAttachments: Record<string, ResolvedAttachment> = {};
  for (const id of attachmentIds) {
    const blob = useSalStore.getState().attachments.find((item) => item.id === id);
    if (blob) resolvedAttachments[id] = { id, name: blob.originalName, mimeType: blob.mimeType, base64: await attachmentBase64(blob) };
  }

  const controller = new AbortController();
  controllers.set(conversation.id, controller);
  const started = Date.now();
  let current = assistantMessage;
  let usage = { promptTokens: null as number | null, completionTokens: null as number | null, totalTokens: null as number | null };
  let finishReason: string | null = null;
  let lastPersisted = 0;
  try {
    const stream = adapterFor(provider.kind).streamChat({
      provider, model, conversation, messages: allMessages, credential: await resolveCredential(credential), attachments: resolvedAttachments, signal: controller.signal,
    });
    for await (const event of stream) {
      current = applyEvent(current, event);
      if (event.type === 'usage') usage = event;
      if (event.type === 'finish') finishReason = event.reason;
      if (Date.now() - lastPersisted > 80 || event.type === 'finish') {
        await useSalStore.getState().saveMessage(current);
        lastPersisted = Date.now();
      }
    }
    current = { ...current, status: 'complete', updatedAt: new Date().toISOString() };
    await useSalStore.getState().saveMessage(current);
    if (credential) await useSalStore.getState().saveProvider({ ...provider, lastCredentialId: credential.id, updatedAt: new Date().toISOString() });
  } catch (error) {
    const failure = classifyProviderError({ kind: provider.kind, message: error instanceof Error ? error.message : String(error), aborted: controller.signal.aborted });
    current = {
      ...current,
      status: current.parts.some((part) => (part.type === 'text' || part.type === 'reasoning') && part.text) ? 'interrupted' : 'failed',
      parts: [...current.parts, { type: 'text', text: `\n\n_${failure.title}: ${failure.guidance}_` }],
      updatedAt: new Date().toISOString(),
    };
    await useSalStore.getState().saveMessage(current);
    finishReason = failure.code;
  } finally {
    controllers.delete(conversation.id);
    const generation: Generation = {
      id: createId(), conversationId: conversation.id, messageId: current.id,
      provenance: {
        providerId: provider.id, providerName: provider.displayName, modelId: model.id, modelName: model.displayName, wireModelId: model.wireId,
        credentialId: credential?.id ?? null, credentialName: credential?.displayName ?? null,
      },
      finishReason, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens,
      latencyMs: Date.now() - started, errorCode: current.status === 'failed' || current.status === 'interrupted' ? finishReason : null, createdAt: new Date().toISOString(),
    };
    await useSalStore.getState().saveGeneration(generation);
  }
}

export function stopGeneration(conversationId: string): void {
  controllers.get(conversationId)?.abort();
}

export function isGenerating(conversationId: string): boolean {
  return controllers.has(conversationId);
}

function applyEvent(message: Message, event: AdapterEvent): Message {
  let parts = message.parts;
  if (event.type === 'text_delta') parts = appendTextPart(parts, 'text', event.text);
  if (event.type === 'reasoning_delta') parts = appendTextPart(parts, 'reasoning', event.text);
  if (event.type === 'warning') parts = appendTextPart(parts, 'text', `\n\n_${event.message}_`);
  if (event.type === 'tool_call') parts = [...parts, { type: 'tool_call', name: event.name, arguments: event.arguments }];
  return { ...message, parts, updatedAt: new Date().toISOString() };
}

function appendTextPart(parts: MessagePart[], type: 'text' | 'reasoning', delta: string): MessagePart[] {
  const last = parts.at(-1);
  if (last?.type === type) return [...parts.slice(0, -1), { ...last, text: last.text + delta }];
  return [...parts, { type, text: delta }];
}

function validateAttachments(model: ReturnType<typeof useSalStore.getState>['models'][number], attachments: ReturnType<typeof useSalStore.getState>['attachments']): void {
  const maxCount = model.limits.maxAttachmentCount.value;
  if (maxCount !== null && attachments.length > maxCount) throw new Error(`${model.displayName} allows at most ${maxCount} attachments.`);
  for (const attachment of attachments) {
    if (attachment.modality === 'image' && !model.capabilities.image.value) throw new Error(`${model.displayName} is not configured for image input.`);
    if (attachment.modality === 'audio' && !model.capabilities.audio.value) throw new Error(`${model.displayName} is not configured for audio input.`);
    if (attachment.modality === 'video' && !model.capabilities.video.value) throw new Error(`${model.displayName} is not configured for video input.`);
    const maxBytes = model.limits.maxFileBytes.value;
    if (maxBytes !== null && attachment.byteSize > maxBytes) throw new Error(`${attachment.originalName} exceeds this model’s configured file-size limit.`);
  }
}
