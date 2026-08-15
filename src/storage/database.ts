import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  // Stay on this connection. withExclusiveTransactionAsync opens a second native
  // connection and Expo documents that other writes then fail with SQLITE_BUSY
  // ("database is locked") during finalizeAsync.
  // WASM SQLite does not give us the native WAL contract.
  const journal = Platform.OS === 'web' ? '' : 'PRAGMA journal_mode = WAL; ';
  await db.execAsync(`${journal}PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`);
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY NOT NULL, provider_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS credentials_provider_idx ON credentials(provider_id);
      CREATE TABLE IF NOT EXISTS models (id TEXT PRIMARY KEY NOT NULL, provider_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS models_provider_idx ON models(provider_id);
      CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY NOT NULL, conversation_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);
      CREATE TABLE IF NOT EXISTS generations (id TEXT PRIMARY KEY NOT NULL, conversation_id TEXT NOT NULL, message_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY NOT NULL, sha256 TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS message_attachments (message_id TEXT NOT NULL, attachment_id TEXT NOT NULL, PRIMARY KEY(message_id, attachment_id));
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);
      PRAGMA user_version = ${DATABASE_VERSION};
    `);
  }
}

interface PayloadRow { payload: string }

export async function loadPayloads<T>(db: SQLiteDatabase, table: string): Promise<T[]> {
  assertTable(table);
  const rows = await db.getAllAsync<PayloadRow>(`SELECT payload FROM ${table}`);
  return rows.map((row) => JSON.parse(row.payload) as T);
}

export async function upsertPayload(
  db: SQLiteDatabase,
  table: 'providers' | 'credentials' | 'models' | 'conversations' | 'messages' | 'generations' | 'attachments',
  value: { id: string; providerId?: string; conversationId?: string; messageId?: string; updatedAt?: string; createdAt?: string; sha256?: string },
): Promise<void> {
  const payload = JSON.stringify(value);
  const timestamp = value.updatedAt ?? value.createdAt ?? new Date().toISOString();
  if (table === 'credentials' || table === 'models') {
    await db.runAsync(`INSERT OR REPLACE INTO ${table} (id, provider_id, payload, updated_at) VALUES (?, ?, ?, ?)`, value.id, value.providerId ?? '', payload, timestamp);
  } else if (table === 'messages') {
    await db.runAsync('INSERT OR REPLACE INTO messages (id, conversation_id, payload, updated_at) VALUES (?, ?, ?, ?)', value.id, value.conversationId ?? '', payload, timestamp);
  } else if (table === 'generations') {
    await db.runAsync('INSERT OR REPLACE INTO generations (id, conversation_id, message_id, payload, created_at) VALUES (?, ?, ?, ?, ?)', value.id, value.conversationId ?? '', value.messageId ?? '', payload, timestamp);
  } else if (table === 'attachments') {
    await db.runAsync('INSERT OR REPLACE INTO attachments (id, sha256, payload, created_at) VALUES (?, ?, ?, ?)', value.id, value.sha256 ?? '', payload, timestamp);
  } else {
    await db.runAsync(`INSERT OR REPLACE INTO ${table} (id, payload, updated_at) VALUES (?, ?, ?)`, value.id, payload, timestamp);
  }
}

export async function deletePayload(db: SQLiteDatabase, table: string, id: string): Promise<void> {
  assertTable(table);
  await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
}

export async function loadSetting<T>(db: SQLiteDatabase, key: string): Promise<T | null> {
  const row = await db.getFirstAsync<PayloadRow>('SELECT payload FROM settings WHERE key = ?', key);
  return row ? (JSON.parse(row.payload) as T) : null;
}

export async function saveSetting<T>(db: SQLiteDatabase, key: string, value: T): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, payload) VALUES (?, ?)', key, JSON.stringify(value));
}

function assertTable(table: string): void {
  if (!['providers', 'credentials', 'models', 'conversations', 'messages', 'generations', 'attachments'].includes(table)) {
    throw new Error(`Unsupported table: ${table}`);
  }
}
