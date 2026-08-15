import type { AppSettings, Conversation, ConversationContext } from './types';

export const DEFAULT_CONTEXT_MODE: AppSettings['contextManagementDefault'] = 'automatic';

export function createDefaultConversationContext(): ConversationContext {
  return { mode: 'inherit', note: '', pinnedMessageIds: [], checkpoint: null };
}

export function normalizeConversation(conversation: Conversation): Conversation {
  const stored = conversation.context as Partial<ConversationContext> | undefined;
  return {
    ...conversation,
    context: {
      mode: stored?.mode === 'automatic' || stored?.mode === 'manual' ? stored.mode : 'inherit',
      note: typeof stored?.note === 'string' ? stored.note : '',
      pinnedMessageIds: Array.isArray(stored?.pinnedMessageIds)
        ? stored.pinnedMessageIds.filter((id): id is string => typeof id === 'string')
        : [],
      checkpoint: stored?.checkpoint ?? null,
    },
  };
}

export function effectiveContextMode(conversation: Conversation, settings: AppSettings): 'automatic' | 'manual' {
  return conversation.context.mode === 'inherit' ? settings.contextManagementDefault : conversation.context.mode;
}
