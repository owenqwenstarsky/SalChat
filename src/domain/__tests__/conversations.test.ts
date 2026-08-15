import {
  conversationHasMessages,
  groupConversationsByRecency,
  latestConversationWithMessages,
  preferredModel,
  recencyGroup,
  relativeTime,
  unusedEmptyConversations,
} from '../conversations';

const noon = new Date('2026-08-15T12:00:00').getTime();

function conversation(id: string, updatedAt: string, title = 'Chat') {
  return { id, title, updatedAt };
}

describe('recencyGroup', () => {
  it('buckets timestamps relative to local midnight', () => {
    expect(recencyGroup('2026-08-15T08:00:00', noon)).toBe('today');
    expect(recencyGroup('2026-08-14T18:00:00', noon)).toBe('yesterday');
    expect(recencyGroup('2026-08-10T12:00:00', noon)).toBe('week');
    expect(recencyGroup('2026-07-01T12:00:00', noon)).toBe('older');
  });
});

describe('groupConversationsByRecency', () => {
  it('omits empty sections and keeps recency order', () => {
    const sections = groupConversationsByRecency(
      [
        conversation('a', '2026-08-15T09:00:00'),
        conversation('b', '2026-07-01T09:00:00'),
        conversation('c', '2026-08-14T09:00:00'),
      ],
      noon,
    );
    expect(sections.map((section) => section.key)).toEqual(['today', 'yesterday', 'older']);
    expect(sections[0]?.items.map((item) => item.id)).toEqual(['a']);
  });
});

describe('relativeTime', () => {
  it('formats compact elapsed time', () => {
    expect(relativeTime(new Date(noon).toISOString(), noon)).toBe('now');
    expect(relativeTime(new Date(noon - 5 * 60_000).toISOString(), noon)).toBe('5m');
    expect(relativeTime(new Date(noon - 3 * 60 * 60_000).toISOString(), noon)).toBe('3h');
    expect(relativeTime(new Date(noon - 48 * 60 * 60_000).toISOString(), noon)).toBe('2d');
  });
});

describe('conversation selection', () => {
  it('finds the latest thread that actually has messages', () => {
    const conversations = [
      conversation('empty', '2026-08-15T11:00:00', 'New conversation'),
      conversation('old', '2026-08-14T11:00:00'),
      conversation('recent', '2026-08-15T10:00:00'),
    ];
    const messages = [{ conversationId: 'old' }, { conversationId: 'recent' }];
    expect(latestConversationWithMessages(conversations, messages)?.id).toBe('recent');
    expect(conversationHasMessages('empty', messages)).toBe(false);
    expect(unusedEmptyConversations(conversations, messages).map((item) => item.id)).toEqual(['empty']);
    expect(unusedEmptyConversations(conversations, messages, 'empty')).toEqual([]);
  });
});

describe('preferredModel', () => {
  it('prefers enabled favorites, then sort order', () => {
    const models = [
      { id: 'off', enabled: false, favorite: true, sortOrder: 0 },
      { id: 'plain', enabled: true, favorite: false, sortOrder: 0 },
      { id: 'fav', enabled: true, favorite: true, sortOrder: 2 },
    ];
    expect(preferredModel(models)?.id).toBe('fav');
    expect(preferredModel(models.filter((item) => item.id !== 'fav'))?.id).toBe('plain');
    expect(preferredModel([])).toBeNull();
  });
});
