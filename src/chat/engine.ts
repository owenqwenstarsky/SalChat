import { adapterFor } from '@/adapters';
import type { AdapterEvent, ChatRequest, ResolvedAttachment, ResolvedCredential } from '@/adapters/types';
import { buildCompactionMessages, buildEffectiveContext, estimateTextTokens, selectCompactionChunk } from './context';
import { effectiveContextMode } from '@/domain/context';
import { ConfigurationError } from '@/domain/configError';
import { createId } from '@/domain/factories';
import { modelLabel } from '@/domain/labels';
import type { Conversation, CredentialProfile, Message, MessagePart, Model, Provider } from '@/domain/types';
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

interface ChatSession {
  conversation: Conversation;
  model: Model;
  provider: Provider;
  credential: CredentialProfile | null;
  resolvedCredential: ResolvedCredential;
}

export class ContextPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextPreparationError';
  }
}

export async function sendMessage(input: SendInput): Promise<void> {
  const state = useSalStore.getState();
  const session = await resolveSession(input.conversationId);
  const { conversation, model, provider, credential } = session;

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
  const controller = new AbortController();
  controllers.set(conversation.id, controller);
  const started = Date.now();
  let current = assistantMessage;
  let usage = { promptTokens: null as number | null, completionTokens: null as number | null, totalTokens: null as number | null };
  let finishReason: string | null = null;
  let lastPersisted = 0;
  let messagesPersisted = false;
  try {
    const history = conversationMessages(conversation.id);
    await compactToBudget(session, [...history, userMessage], controller);

    await state.saveMessage(userMessage);
    await state.saveMessage(assistantMessage);
    messagesPersisted = true;
    if (conversation.title === 'New conversation' && input.text.trim()) {
      const latest = currentConversation(conversation.id);
      await state.saveConversation({ ...latest, title: input.text.trim().replace(/\s+/g, ' ').slice(0, 52), updatedAt: timestamp });
    }

    let terminalError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const latestConversation = currentConversation(conversation.id);
        const request = await chatRequest(session, latestConversation, conversationMessages(conversation.id, assistantMessage.id), controller, userMessage.id);
        const stream = adapterFor(provider.kind).streamChat(request);
        for await (const event of stream) {
          current = applyEvent(current, event);
          if (event.type === 'usage') usage = event;
          if (event.type === 'finish') finishReason = event.reason;
          if (Date.now() - lastPersisted > 80 || event.type === 'finish') {
            await useSalStore.getState().saveMessage(current);
            lastPersisted = Date.now();
          }
        }
        terminalError = null;
        break;
      } catch (error) {
        const failure = classifyProviderError({ kind: provider.kind, message: error instanceof Error ? error.message : String(error), aborted: controller.signal.aborted });
        const hasOutput = current.parts.some((part) => (part.type === 'text' || part.type === 'reasoning') && part.text);
        if (failure.code === 'context_length' && !hasOutput && effectiveContextMode(currentConversation(conversation.id), useSalStore.getState().settings) === 'automatic') {
          if (attempt === 0) {
            try {
              const compacted = await compactOnce(session, conversationMessages(conversation.id, assistantMessage.id), controller, false, true);
              if (!compacted) throw new Error('There is no older unpinned history available to compress.');
            } catch (compactionError) {
              await useSalStore.getState().deleteMessages([userMessage.id, assistantMessage.id]);
              messagesPersisted = false;
              throw new ContextPreparationError(`Could not compress this conversation: ${compactionError instanceof Error ? compactionError.message : String(compactionError)}`);
            }
            continue;
          } else {
            await useSalStore.getState().deleteMessages([userMessage.id, assistantMessage.id]);
            messagesPersisted = false;
            throw new ContextPreparationError('This conversation still exceeds the provider context limit after compression. Shorten the context note, unpin messages, or choose a model with a larger context window.');
          }
        }
        terminalError = error;
        break;
      }
    }

    if (terminalError) {
      const failure = classifyProviderError({ kind: provider.kind, message: terminalError instanceof Error ? terminalError.message : String(terminalError), aborted: controller.signal.aborted });
      current = {
        ...current,
        status: current.parts.some((part) => (part.type === 'text' || part.type === 'reasoning') && part.text) ? 'interrupted' : 'failed',
        parts: [...current.parts, { type: 'text', text: `\n\n_${failure.title}: ${failure.guidance}_` }],
        updatedAt: new Date().toISOString(),
      };
      await useSalStore.getState().saveMessage(current);
      finishReason = failure.code;
    } else {
      current = { ...current, status: 'complete', updatedAt: new Date().toISOString() };
      await useSalStore.getState().saveMessage(current);
      if (credential) await useSalStore.getState().saveProvider({ ...provider, lastCredentialId: credential.id, updatedAt: new Date().toISOString() });
    }
  } finally {
    controllers.delete(conversation.id);
    if (messagesPersisted) await useSalStore.getState().saveGeneration({
      id: createId(), conversationId: conversation.id, messageId: current.id,
      provenance: {
        providerId: provider.id, providerName: provider.displayName, modelId: model.id, modelName: modelLabel(model), wireModelId: model.wireId,
        credentialId: credential?.id ?? null, credentialName: credential?.displayName ?? null,
      },
      finishReason, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens,
      latencyMs: Date.now() - started, errorCode: current.status === 'failed' || current.status === 'interrupted' ? finishReason : null, createdAt: new Date().toISOString(),
    });
  }
}

export async function compactConversation(conversationId: string, rebuild = false): Promise<number> {
  if (controllers.has(conversationId)) throw new Error('Wait for the current response to finish.');
  const session = await resolveSession(conversationId);
  const controller = new AbortController();
  controllers.set(conversationId, controller);
  let count = 0;
  try {
    while (await compactOnce(session, conversationMessages(conversationId), controller, count === 0 && rebuild)) count += 1;
    if (!count) throw new Error('There is not enough older unpinned history to compact yet.');
    return count;
  } finally {
    controllers.delete(conversationId);
  }
}

export function stopGeneration(conversationId: string): void {
  controllers.get(conversationId)?.abort();
}

export function isGenerating(conversationId: string): boolean {
  return controllers.has(conversationId);
}

async function resolveSession(conversationId: string): Promise<ChatSession> {
  const state = useSalStore.getState();
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) throw new Error('Conversation not found.');
  const model = state.models.find((item) => item.id === conversation.selectedModelId);
  if (!model) throw new ConfigurationError('Choose a model before sending.', { kind: 'models' });
  const provider = state.providers.find((item) => item.id === model.providerId);
  if (!provider) throw new ConfigurationError('The selected model provider no longer exists.', { kind: 'models' });
  const credentialId = conversation.selectedCredentialId ?? provider.lastCredentialId;
  const credential = state.credentials.find((item) => item.id === credentialId) ?? null;
  if (state.credentials.some((item) => item.providerId === provider.id) && !credential) {
    throw new ConfigurationError('Choose an account for this provider before sending.', { kind: 'provider', providerId: provider.id });
  }
  return { conversation, model, provider, credential, resolvedCredential: await resolveCredential(credential) };
}

async function compactToBudget(session: ChatSession, messages: Message[], controller: AbortController): Promise<void> {
  let guard = 0;
  while (effectiveContextMode(currentConversation(session.conversation.id), useSalStore.getState().settings) === 'automatic') {
    const conversation = currentConversation(session.conversation.id);
    const effective = buildEffectiveContext(requestBase(session, conversation, controller), messages, useSalStore.getState().attachments, messages.at(-1)?.id);
    if (!effective.budget.overBudget) return;
    if (!(await compactOnce(session, messages, controller, false, true))) {
      throw new ContextPreparationError('Pinned context and recent messages do not fit this model. Shorten the context note, unpin messages, or choose a model with a larger context window.');
    }
    guard += 1;
    if (guard > messages.length + 1) throw new ContextPreparationError('Context compression did not reduce the request enough to fit this model.');
  }
}

async function compactOnce(session: ChatSession, messages: Message[], controller: AbortController, rebuild = false, aggressive = false): Promise<boolean> {
  const conversation = currentConversation(session.conversation.id);
  const effective = buildEffectiveContext(requestBase(session, conversation, controller), messages, useSalStore.getState().attachments);
  const chunk = selectCompactionChunk(conversation, messages, useSalStore.getState().attachments, effective.budget.inputCeiling, rebuild, aggressive);
  if (!chunk) return false;
  const timestamp = new Date().toISOString();
  const summaryChunk = session.model.limits.resendsMediaInHistory.value ? chunk : {
    ...chunk,
    messages: chunk.messages.map((message) => ({
      ...message,
      parts: message.parts.map((part) => part.type === 'attachment' ? { type: 'text' as const, text: `[Attachment: ${part.name}]` } : part),
    })),
  };
  const checkpointBase = rebuild ? { ...conversation, context: { ...conversation.context, checkpoint: null } } : conversation;
  const compactionMessages = buildCompactionMessages(checkpointBase, summaryChunk, timestamp);
  const resolvedAttachments = await resolveMessageAttachments(compactionMessages);
  const maxOutput = Math.min(2_048, session.model.limits.maxOutputTokens.value ?? 2_048);
  let summary = '';
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let totalTokens: number | null = null;
  for await (const event of adapterFor(session.provider.kind).streamChat({
    ...requestBase(session, conversation, controller),
    messages: compactionMessages,
    attachments: resolvedAttachments,
    purpose: 'compaction',
    overrides: { temperature: 0.2, maxOutputTokens: maxOutput, stopSequences: [] },
  })) {
    if (event.type === 'text_delta') summary += event.text;
    if (event.type === 'usage') ({ promptTokens, completionTokens, totalTokens } = event);
  }
  summary = summary.trim();
  if (!summary) throw new Error('The model returned an empty context checkpoint.');
  const latest = currentConversation(conversation.id);
  const provenance = {
    providerId: session.provider.id,
    providerName: session.provider.displayName,
    modelId: session.model.id,
    modelName: modelLabel(session.model),
    wireModelId: session.model.wireId,
    credentialId: session.credential?.id ?? null,
    credentialName: session.credential?.displayName ?? null,
  };
  await useSalStore.getState().saveConversation({
    ...latest,
    context: {
      ...latest.context,
      checkpoint: {
        summary,
        throughMessageId: chunk.throughMessageId,
        revision: (latest.context.checkpoint?.revision ?? 0) + 1,
        sourceMessageCount: (rebuild ? 0 : latest.context.checkpoint?.sourceMessageCount ?? 0) + chunk.messages.length,
        estimatedTokensBefore: effective.budget.estimatedTokens,
        estimatedTokensAfter: estimateTextTokens(summary),
        provenance,
        promptTokens,
        completionTokens,
        totalTokens,
        createdAt: timestamp,
      },
    },
    updatedAt: timestamp,
  });
  return true;
}

async function chatRequest(session: ChatSession, conversation: Conversation, messages: Message[], controller: AbortController, currentMessageId: string): Promise<ChatRequest> {
  const effective = buildEffectiveContext(requestBase(session, conversation, controller), messages, useSalStore.getState().attachments, currentMessageId);
  return {
    ...requestBase(session, conversation, controller),
    messages: effective.messages,
    attachments: await resolveMessageAttachments(effective.messages),
    contextEnvelope: effective.envelope,
  };
}

function requestBase(session: ChatSession, conversation: Conversation, controller: AbortController): Omit<ChatRequest, 'messages' | 'attachments'> {
  return { provider: session.provider, model: session.model, conversation, credential: session.resolvedCredential, signal: controller.signal };
}

function conversationMessages(conversationId: string, excludedId?: string): Message[] {
  return useSalStore.getState().messages
    .filter((message) => message.conversationId === conversationId && message.id !== excludedId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function currentConversation(conversationId: string): Conversation {
  const conversation = useSalStore.getState().conversations.find((item) => item.id === conversationId);
  if (!conversation) throw new Error('Conversation not found.');
  return conversation;
}

async function resolveMessageAttachments(messages: Message[]): Promise<Record<string, ResolvedAttachment>> {
  const ids = new Set(messages.flatMap((message) => message.parts.filter((part) => part.type === 'attachment').map((part) => part.attachmentId)));
  const resolved: Record<string, ResolvedAttachment> = {};
  for (const id of ids) {
    const blob = useSalStore.getState().attachments.find((item) => item.id === id);
    if (blob) resolved[id] = { id, name: blob.originalName, mimeType: blob.mimeType, base64: await attachmentBase64(blob) };
  }
  return resolved;
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
  const destination = { kind: 'model' as const, modelId: model.id };
  const maxCount = model.limits.maxAttachmentCount.value;
  if (maxCount !== null && attachments.length > maxCount) {
    throw new ConfigurationError(`${modelLabel(model)} allows at most ${maxCount} attachments.`, { ...destination, focus: 'limits' });
  }
  for (const attachment of attachments) {
    if (attachment.modality === 'image' && !model.capabilities.image.value) {
      throw new ConfigurationError(`${modelLabel(model)} is not configured for image input.`, { ...destination, focus: 'capabilities' });
    }
    if (attachment.modality === 'audio' && !model.capabilities.audio.value) {
      throw new ConfigurationError(`${modelLabel(model)} is not configured for audio input.`, { ...destination, focus: 'capabilities' });
    }
    if (attachment.modality === 'video' && !model.capabilities.video.value) {
      throw new ConfigurationError(`${modelLabel(model)} is not configured for video input.`, { ...destination, focus: 'capabilities' });
    }
    const maxBytes = model.limits.maxFileBytes.value;
    if (maxBytes !== null && attachment.byteSize > maxBytes) {
      throw new ConfigurationError(`${attachment.originalName} exceeds this model’s configured file-size limit.`, { ...destination, focus: 'limits' });
    }
  }
}
