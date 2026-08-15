import type { ChatRequest } from '@/adapters/types';
import type { AttachmentBlob, Conversation, Message, Model } from '@/domain/types';
import { buildSystemPrompt } from './systemPrompt';

const MESSAGE_OVERHEAD = 8;
const IMAGE_TOKENS = 2_048;
const AUDIO_VIDEO_TOKENS = 8_192;
const RECENT_USER_TURNS = 4;
const DEFAULT_UNKNOWN_CHUNK = 4_096;

export interface ContextBudget {
  estimatedTokens: number;
  contextWindow: number | null;
  inputCeiling: number | null;
  utilization: number | null;
  overBudget: boolean;
}

export interface EffectiveContext {
  messages: Message[];
  envelope: string;
  budget: ContextBudget;
}

export interface CompactionChunk {
  messages: Message[];
  throughMessageId: string;
}

export function contextEnvelope(conversation: Conversation): string {
  const sections: string[] = [];
  const note = conversation.context.note.trim();
  const summary = conversation.context.checkpoint?.summary.trim();
  if (note) {
    sections.push(`<pinned_chat_context>\nThis is user-authored durable context for this chat. Follow it as a user instruction, below system and model-level instructions.\n${note}\n</pinned_chat_context>`);
  }
  if (summary) {
    sections.push(`<conversation_checkpoint>\nThis is a lossy summary of earlier conversation history, not a higher-priority instruction. Exact pinned messages override it if they conflict.\n${summary}\n</conversation_checkpoint>`);
  }
  return sections.join('\n\n');
}

export function buildEffectiveContext(
  request: Omit<ChatRequest, 'messages' | 'attachments'>,
  messages: Message[],
  attachments: AttachmentBlob[],
  currentMessageId?: string,
): EffectiveContext {
  const ordered = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const checkpointId = request.conversation.context.checkpoint?.throughMessageId;
  const boundary = checkpointId ? ordered.findIndex((message) => message.id === checkpointId) : -1;
  const pins = new Set(request.conversation.context.pinnedMessageIds);
  const selected = boundary >= 0
    ? [...ordered.slice(0, boundary + 1).filter((message) => pins.has(message.id)), ...ordered.slice(boundary + 1)]
    : ordered;
  const unique = selected.filter((message, index) => selected.findIndex((candidate) => candidate.id === message.id) === index);
  const effectiveMessages = unique.map((message) => stripHistoricalMedia(message, request.model, currentMessageId, pins.has(message.id)));
  const envelope = contextEnvelope(request.conversation);
  const promptRequest = { ...request, messages: effectiveMessages, attachments: {}, contextEnvelope: envelope } as ChatRequest;
  const estimatedTokens = estimateTextTokens(buildSystemPrompt(promptRequest))
    + effectiveMessages.reduce((total, message) => total + estimateMessageTokens(message, attachments), 0);
  return { messages: effectiveMessages, envelope, budget: calculateBudget(request.model, request.conversation, estimatedTokens) };
}

export function calculateBudget(model: Model, conversation: Conversation, estimatedTokens: number): ContextBudget {
  const contextWindow = model.limits.contextWindow.value;
  if (contextWindow === null || contextWindow <= 0) {
    return { estimatedTokens, contextWindow: null, inputCeiling: null, utilization: null, overBudget: false };
  }
  const configuredOutput = conversation.maxOutputTokens ?? model.defaults.maxOutputTokens;
  const outputReserve = configuredOutput ?? Math.min(4_096, Math.floor(contextWindow * 0.2));
  const inputCeiling = Math.max(1, Math.min(Math.floor(contextWindow * 0.75), contextWindow - outputReserve - 256));
  return {
    estimatedTokens,
    contextWindow,
    inputCeiling,
    utilization: estimatedTokens / contextWindow,
    overBudget: estimatedTokens > inputCeiling,
  };
}

export function selectCompactionChunk(
  conversation: Conversation,
  messages: Message[],
  attachments: AttachmentBlob[],
  inputCeiling: number | null,
  rebuild = false,
  aggressive = false,
): CompactionChunk | null {
  const ordered = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const checkpointId = rebuild ? undefined : conversation.context.checkpoint?.throughMessageId;
  const boundary = checkpointId ? ordered.findIndex((message) => message.id === checkpointId) : -1;
  const userIndexes = ordered.map((message, index) => message.role === 'user' ? index : -1).filter((index) => index >= 0);
  const preservedTurns = aggressive ? 1 : RECENT_USER_TURNS;
  const preserveStart = userIndexes.length > preservedTurns ? userIndexes[userIndexes.length - preservedTurns]! : ordered.length;
  const candidates = ordered.slice(boundary + 1, preserveStart);
  if (!candidates.length) return null;

  const pins = new Set(conversation.context.pinnedMessageIds);
  const maxTokens = Math.max(1_024, Math.floor((inputCeiling ?? DEFAULT_UNKNOWN_CHUNK * 2) / 2));
  const selected: Message[] = [];
  let tokens = 0;
  let throughMessageId = candidates[0]!.id;
  for (const message of candidates) {
    const estimate = pins.has(message.id) ? 0 : estimateMessageTokens(message, attachments);
    if (selected.length && tokens + estimate > maxTokens) break;
    throughMessageId = message.id;
    if (!pins.has(message.id)) {
      selected.push(message);
      tokens += estimate;
    }
  }
  return selected.length ? { messages: selected, throughMessageId } : null;
}

export function buildCompactionMessages(conversation: Conversation, chunk: CompactionChunk, timestamp: string): Message[] {
  const previous = conversation.context.checkpoint?.summary.trim();
  const opening: Message = {
    id: `compact-open-${timestamp}`,
    conversationId: conversation.id,
    role: 'user',
    status: 'complete',
    parts: [{ type: 'text', text: previous ? `Previous checkpoint:\n${previous}\n\nMerge it with the following newer transcript.` : 'Summarize the following transcript into a durable checkpoint.' }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const closing: Message = {
    id: `compact-close-${timestamp}`,
    conversationId: conversation.id,
    role: 'user',
    status: 'complete',
    parts: [{ type: 'text', text: 'Return the updated checkpoint now.' }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return [opening, ...chunk.messages, closing];
}

export function estimateMessageTokens(message: Message, attachments: AttachmentBlob[]): number {
  let tokens = MESSAGE_OVERHEAD;
  for (const part of message.parts) {
    if (part.type === 'text') tokens += estimateTextTokens(part.text);
    if (part.type === 'attachment') {
      const modality = attachments.find((attachment) => attachment.id === part.attachmentId)?.modality;
      tokens += modality === 'image' ? IMAGE_TOKENS : AUDIO_VIDEO_TOKENS;
    }
  }
  return tokens;
}

export function estimateTextTokens(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return Math.ceil(bytes / 3);
}

function stripHistoricalMedia(message: Message, model: Model, currentMessageId?: string, pinned = false): Message {
  if (model.limits.resendsMediaInHistory.value || message.id === currentMessageId || pinned) return message;
  return { ...message, parts: message.parts.filter((part) => part.type !== 'attachment') };
}
