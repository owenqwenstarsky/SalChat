import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { deletePayload, loadPayloads, loadSetting, migrateDatabase, saveSetting, upsertPayload } from '../database';

function fakeDb(overrides: Partial<SQLiteDatabase> = {}): SQLiteDatabase {
  const db: Record<string, unknown> = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn().mockResolvedValue({ user_version: 1 }),
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
  };
  db.withTransactionAsync = jest.fn(async (callback: () => Promise<void>): Promise<void> => callback());
  Object.assign(db, overrides);
  return db as unknown as SQLiteDatabase;
}

describe('SQLite persistence helpers', () => {
  it('initializes pragmas and creates the first schema migration', async () => {
    const db = fakeDb({ getFirstAsync: jest.fn().mockResolvedValue({ user_version: 0 }) as never });
    await migrateDatabase(db);
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('journal_mode'));
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('busy_timeout'));
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS providers'));
  });

  it('skips WAL on web while still enabling foreign keys', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    try {
      const db = fakeDb({ getFirstAsync: jest.fn().mockResolvedValue({ user_version: 0 }) as never });
      await migrateDatabase(db);
      expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('foreign_keys'));
      expect(db.execAsync).not.toHaveBeenCalledWith(expect.stringContaining('journal_mode'));
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
    }
  });

  it('skips schema creation when current and parses payload rows', async () => {
    const db = fakeDb({ getAllAsync: jest.fn().mockResolvedValue([{ payload: '{"id":"a"}' }]) as never });
    await migrateDatabase(db);
    expect(db.execAsync).not.toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE'));
    await expect(loadPayloads<{ id: string }>(db, 'providers')).resolves.toEqual([{ id: 'a' }]);
  });

  it.each([
    ['providers', { id: 'p', updatedAt: 'now' }], ['credentials', { id: 'c', providerId: 'p', updatedAt: 'now' }],
    ['models', { id: 'm', providerId: 'p', updatedAt: 'now' }], ['conversations', { id: 'v', updatedAt: 'now' }],
    ['messages', { id: 'msg', conversationId: 'v', updatedAt: 'now' }], ['generations', { id: 'g', conversationId: 'v', messageId: 'msg', createdAt: 'now' }],
    ['attachments', { id: 'a', sha256: 'hash', createdAt: 'now' }],
  ] as const)('upserts %s with its relational keys', async (table, value) => {
    const db = fakeDb();
    await upsertPayload(db, table, value);
    expect(db.runAsync).toHaveBeenCalledTimes(1);
  });

  it('deletes allowlisted rows and rejects arbitrary table names', async () => {
    const db = fakeDb();
    await deletePayload(db, 'models', 'm');
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM models WHERE id = ?', 'm');
    await expect(loadPayloads(db, 'unsafe; DROP TABLE models')).rejects.toThrow('Unsupported table');
  });

  it('loads and saves JSON settings', async () => {
    const db = fakeDb({ getFirstAsync: jest.fn().mockResolvedValue({ payload: '{"mode":"dark"}' }) as never });
    await expect(loadSetting<{ mode: string }>(db, 'app')).resolves.toEqual({ mode: 'dark' });
    await saveSetting(db, 'app', { mode: 'light' });
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('settings'), 'app', '{"mode":"light"}');
  });
});
