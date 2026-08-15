export type RecencyGroup = 'today' | 'yesterday' | 'week' | 'older';

export interface ConversationRecencySection<T> {
  key: RecencyGroup;
  title: string;
  items: T[];
}

const GROUP_TITLES: Record<RecencyGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Previous 7 days',
  older: 'Older',
};

const GROUP_ORDER: RecencyGroup[] = ['today', 'yesterday', 'week', 'older'];

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function recencyGroup(updatedAt: string, now = Date.now()): RecencyGroup {
  const time = new Date(updatedAt).getTime();
  const today = startOfLocalDay(now);
  if (time >= today) return 'today';
  if (time >= today - 86_400_000) return 'yesterday';
  if (time >= today - 7 * 86_400_000) return 'week';
  return 'older';
}

export function groupConversationsByRecency<T extends { updatedAt: string }>(
  items: T[],
  now = Date.now(),
): ConversationRecencySection<T>[] {
  const buckets: Record<RecencyGroup, T[]> = { today: [], yesterday: [], week: [], older: [] };
  for (const item of items) buckets[recencyGroup(item.updatedAt, now)].push(item);
  return GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    title: GROUP_TITLES[key],
    items: buckets[key],
  }));
}

export function relativeTime(value: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function conversationHasMessages(
  conversationId: string,
  messages: readonly { conversationId: string }[],
): boolean {
  return messages.some((message) => message.conversationId === conversationId);
}

export function latestConversationWithMessages<T extends { id: string; updatedAt: string }>(
  conversations: readonly T[],
  messages: readonly { conversationId: string }[],
): T | null {
  return [...conversations]
    .filter((item) => conversationHasMessages(item.id, messages))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export function unusedEmptyConversations<T extends { id: string; title: string }>(
  conversations: readonly T[],
  messages: readonly { conversationId: string }[],
  exceptId?: string,
): T[] {
  return conversations.filter(
    (item) =>
      item.id !== exceptId &&
      item.title === 'New conversation' &&
      !conversationHasMessages(item.id, messages),
  );
}

export function preferredModel<T extends { enabled: boolean; favorite: boolean; sortOrder: number }>(
  models: readonly T[],
): T | null {
  return [...models]
    .filter((item) => item.enabled)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.sortOrder - b.sortOrder)[0] ?? null;
}
