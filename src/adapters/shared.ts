import type { ChatRequest, ResolvedAttachment } from './types';
import type { Message, MessagePart } from '@/domain/types';
import { buildSystemPrompt } from '@/chat/systemPrompt';

export function structuredSettings(request: ChatRequest): Record<string, unknown> {
  const defaults = request.model.defaults;
  const settings = request.overrides ?? {};
  const temperature = settings.temperature ?? request.conversation.temperature ?? defaults.temperature;
  const maxTokens = settings.maxOutputTokens ?? request.conversation.maxOutputTokens ?? defaults.maxOutputTokens;
  const stop = settings.stopSequences ?? request.conversation.stopSequences ?? defaults.stopSequences;
  return {
    ...(temperature !== null && request.model.capabilities.temperature.value ? { temperature } : {}),
    ...(maxTokens !== null && request.model.capabilities.maxOutputTokens.value ? { max_completion_tokens: maxTokens } : {}),
    ...(stop.length && request.model.capabilities.stopSequences.value ? { stop } : {}),
  };
}

export function systemPrompt(request: ChatRequest): string {
  return buildSystemPrompt(request);
}

export function messageText(message: Message): string {
  return message.parts.filter((part): part is Extract<MessagePart, { type: 'text' }> => part.type === 'text').map((part) => part.text).join('\n');
}

export function attachmentParts(message: Message, attachments: Record<string, ResolvedAttachment>): ResolvedAttachment[] {
  return message.parts
    .filter((part): part is Extract<MessagePart, { type: 'attachment' }> => part.type === 'attachment')
    .map((part) => attachments[part.attachmentId])
    .filter((attachment): attachment is ResolvedAttachment => Boolean(attachment));
}

export function dataUrl(attachment: ResolvedAttachment): string {
  return `data:${attachment.mimeType};base64,${attachment.base64}`;
}

export async function* decodeResponse(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    const text = await response.text();
    if (text) yield text;
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

export function providerHeaders(request: ChatRequest): Record<string, string> {
  return { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/x-ndjson, application/json', ...request.credential.headers };
}
