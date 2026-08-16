import {
  browserWebSqliteHost,
  createWebSqliteLockSession,
  isOpfsAccessHandleError,
  WEB_SQLITE_LOCK_NAME,
  type WebSqliteChannelMessage,
  type WebSqliteLockHost,
} from '../webSqliteLock';

function createFakeHost(id: string, shared: { owner: string | null; messages: ((message: WebSqliteChannelMessage) => void)[] }): WebSqliteLockHost {
  return {
    id,
    async requestLock(_name, options, callback) {
      if (shared.owner && options.ifAvailable) {
        await callback(null);
        return;
      }
      shared.owner = id;
      try {
        await callback({ name: WEB_SQLITE_LOCK_NAME });
      } finally {
        if (shared.owner === id) shared.owner = null;
      }
    },
    subscribe(listener) {
      shared.messages.push(listener);
      return () => {
        shared.messages = shared.messages.filter((item) => item !== listener);
      };
    },
    publish: jest.fn((message) => {
      for (const listener of [...shared.messages]) listener(message);
    }),
    resetWorker: jest.fn(),
    wait: jest.fn(async () => undefined),
  };
}

describe('web SQLite lock coordination', () => {
  it('detects OPFS access-handle conflicts', () => {
    expect(isOpfsAccessHandleError(new Error('NoModificationAllowedError: Failed to execute \'createSyncAccessHandle\''))).toBe(true);
    expect(isOpfsAccessHandleError(new DOMException('Access Handles cannot be created', 'NoModificationAllowedError'))).toBe(true);
    expect(isOpfsAccessHandleError(new Error('database is locked'))).toBe(false);
    expect(isOpfsAccessHandleError('Failed to execute \'createSyncAccessHandle\'')).toBe(true);
  });

  it('skips lock coordination when the browser APIs are missing', () => {
    expect(browserWebSqliteHost()).toBeNull();
  });

  it('gives the first session the database and blocks the second', async () => {
    const shared = { owner: null as string | null, messages: [] as ((message: WebSqliteChannelMessage) => void)[] };
    const firstHost = createFakeHost('a', shared);
    const secondHost = createFakeHost('b', shared);
    const first = createWebSqliteLockSession(firstHost);
    const second = createWebSqliteLockSession(secondHost);

    await expect(first.claim()).resolves.toBe('ready');
    await expect(second.claim()).resolves.toBe('blocked');
    expect(first.status).toBe('ready');
    expect(second.status).toBe('blocked');

    first.dispose();
    second.dispose();
  });

  it('yields the lock when another tab asks to take over', async () => {
    const shared = { owner: null as string | null, messages: [] as ((message: WebSqliteChannelMessage) => void)[] };
    const firstHost = createFakeHost('a', shared);
    const secondHost = createFakeHost('b', shared);
    const first = createWebSqliteLockSession(firstHost);
    const second = createWebSqliteLockSession(secondHost);
    const statuses: string[] = [];
    first.subscribe((status) => statuses.push(status));

    await first.claim();
    await expect(second.steal()).resolves.toBe('ready');

    expect(first.status).toBe('taken');
    expect(second.status).toBe('ready');
    expect(firstHost.resetWorker).toHaveBeenCalled();
    expect(statuses).toEqual(['checking', 'ready', 'taken']);

    first.dispose();
    second.dispose();
  });

  it('ignores its own yield messages and no-ops a second claim', async () => {
    const shared = { owner: null as string | null, messages: [] as ((message: WebSqliteChannelMessage) => void)[] };
    const host = createFakeHost('a', shared);
    const session = createWebSqliteLockSession(host);
    await expect(session.claim()).resolves.toBe('ready');
    host.publish({ type: 'yield', from: 'a' });
    expect(session.status).toBe('ready');
    await expect(session.claim()).resolves.toBe('ready');
    session.dispose();
    expect(shared.messages).toHaveLength(0);
  });

  it('releases a held lock and stops notifying unsubscribed listeners', async () => {
    const shared = { owner: null as string | null, messages: [] as ((message: WebSqliteChannelMessage) => void)[] };
    const host = createFakeHost('a', shared);
    const session = createWebSqliteLockSession(host);
    const statuses: string[] = [];
    const unsubscribe = session.subscribe((status) => statuses.push(status));
    await session.claim();
    unsubscribe();
    session.release('taken');
    expect(session.status).toBe('taken');
    expect(host.resetWorker).toHaveBeenCalled();
    expect(statuses).toEqual(['checking', 'ready']);
    session.dispose();
  });

  it('treats steal as a no-op when this tab already owns the lock', async () => {
    const shared = { owner: null as string | null, messages: [] as ((message: WebSqliteChannelMessage) => void)[] };
    const host = createFakeHost('a', shared);
    const session = createWebSqliteLockSession(host);
    await session.claim();
    await expect(session.steal()).resolves.toBe('ready');
    expect(host.publish).not.toHaveBeenCalled();
    session.dispose();
  });

  it('drops the lock if the browser lock request fails after grant', async () => {
    let failHold: ((error: Error) => void) | null = null;
    const host: WebSqliteLockHost = {
      id: 'a',
      requestLock: jest.fn((_name, _options, callback) => {
        void callback({ name: WEB_SQLITE_LOCK_NAME });
        return new Promise((_, reject) => {
          failHold = reject;
        });
      }),
      subscribe: () => () => undefined,
      publish: jest.fn(),
      resetWorker: jest.fn(),
      wait: jest.fn(async () => undefined),
    };
    const session = createWebSqliteLockSession(host);
    await expect(session.claim()).resolves.toBe('ready');
    failHold?.(new Error('lock broken'));
    await Promise.resolve();
    expect(session.status).toBe('blocked');
    expect(host.resetWorker).toHaveBeenCalled();
    session.dispose();
  });

  it('wires browser locks, the broadcast channel, and worker reset', async () => {
    const listeners = new Set<(event: MessageEvent<WebSqliteChannelMessage>) => void>();
    const reset = jest.fn();
    (globalThis as { __EXPO_SQLITE_RESET_WORKER?: () => void }).__EXPO_SQLITE_RESET_WORKER = reset;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: jest.fn(async (_name: string, _options: unknown, callback: (lock: { name: string }) => Promise<void>) => {
            await callback({ name: WEB_SQLITE_LOCK_NAME });
          }),
        },
      },
    });
    (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel = class {
      addEventListener(_type: string, listener: (event: MessageEvent<WebSqliteChannelMessage>) => void) {
        listeners.add(listener);
      }
      removeEventListener(_type: string, listener: (event: MessageEvent<WebSqliteChannelMessage>) => void) {
        listeners.delete(listener);
      }
      postMessage(message: WebSqliteChannelMessage) {
        for (const listener of listeners) listener({ data: message } as MessageEvent<WebSqliteChannelMessage>);
      }
      close() {
        listeners.clear();
      }
    } as unknown as typeof BroadcastChannel;

    const host = browserWebSqliteHost('tab-1');
    expect(host).not.toBeNull();
    const received: WebSqliteChannelMessage[] = [];
    const unsubscribe = host!.subscribe((message) => received.push(message));
    host!.publish({ type: 'yield', from: 'tab-2' });
    host!.resetWorker();
    await host!.wait(0);
    await host!.requestLock(WEB_SQLITE_LOCK_NAME, { ifAvailable: true }, async () => undefined);
    unsubscribe();
    host!.dispose?.();
    expect(received).toEqual([{ type: 'yield', from: 'tab-2' }]);
    expect(reset).toHaveBeenCalled();

    delete (globalThis as { __EXPO_SQLITE_RESET_WORKER?: () => void }).__EXPO_SQLITE_RESET_WORKER;
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { navigator?: unknown }).navigator;
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  });

  it('stays blocked if the other tab never releases', async () => {
    const host: WebSqliteLockHost = {
      id: 'b',
      requestLock: jest.fn(async (_name, _options, callback) => {
        await callback(null);
      }),
      subscribe: () => () => undefined,
      publish: jest.fn(),
      resetWorker: jest.fn(),
      wait: jest.fn(async () => undefined),
    };
    const session = createWebSqliteLockSession(host);
    await expect(session.steal()).resolves.toBe('blocked');
    expect(host.publish).toHaveBeenCalledWith({ type: 'yield', from: 'b' });
    expect(host.wait).toHaveBeenCalledTimes(8);
    session.dispose();
  });
});
