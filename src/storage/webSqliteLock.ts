export const WEB_SQLITE_LOCK_NAME = 'sal-chat-sqlite';
export const WEB_SQLITE_CHANNEL_NAME = 'sal-chat-sqlite';

export type WebSqliteLockStatus = 'checking' | 'ready' | 'blocked' | 'taken';

export type WebSqliteChannelMessage =
  | { type: 'yield'; from: string }
  | { type: 'released'; from: string };

export interface WebSqliteLockHost {
  id: string;
  requestLock: (
    name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: { name: string } | null) => Promise<void>,
  ) => Promise<void>;
  subscribe: (listener: (message: WebSqliteChannelMessage) => void) => () => void;
  publish: (message: WebSqliteChannelMessage) => void;
  resetWorker: () => void;
  wait: (ms: number) => Promise<void>;
  dispose?: () => void;
}

export function isOpfsAccessHandleError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /NoModificationAllowedError|createSyncAccessHandle|Access Handles cannot be created/i.test(text);
}

export function createWebSqliteLockSession(host: WebSqliteLockHost) {
  let status: WebSqliteLockStatus = 'checking';
  let releaseHold: (() => void) | null = null;
  let listeners: ((next: WebSqliteLockStatus) => void)[] = [];

  const setStatus = (next: WebSqliteLockStatus) => {
    status = next;
    for (const listener of listeners) listener(next);
  };

  const holdLock = () =>
    new Promise<void>((resolve) => {
      releaseHold = resolve;
    });

  const release = (next: WebSqliteLockStatus) => {
    host.resetWorker();
    releaseHold?.();
    releaseHold = null;
    if (next === 'taken' || next === 'blocked') {
      host.publish({ type: 'released', from: host.id });
    }
    setStatus(next);
  };

  const tryClaim = async (): Promise<boolean> => {
    if (status === 'ready') return true;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (claimed: boolean) => {
        if (settled) return;
        settled = true;
        resolve(claimed);
      };
      void host
        .requestLock(WEB_SQLITE_LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            finish(false);
            return;
          }
          setStatus('ready');
          finish(true);
          await holdLock();
        })
        .catch((error) => {
          if (status === 'ready') release('blocked');
          if (!settled) reject(error);
        });
    });
  };

  const unsubscribe = host.subscribe((message) => {
    if (message.from === host.id) return;
    if (message.type === 'yield' && status === 'ready') {
      release('taken');
    }
  });

  return {
    get status() {
      return status;
    },
    subscribe(listener: (next: WebSqliteLockStatus) => void) {
      listeners = [...listeners, listener];
      listener(status);
      return () => {
        listeners = listeners.filter((item) => item !== listener);
      };
    },
    async claim() {
      if (await tryClaim()) return 'ready' as const;
      setStatus('blocked');
      return 'blocked' as const;
    },
    async steal() {
      if (status === 'ready') return 'ready' as const;
      host.publish({ type: 'yield', from: host.id });
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await host.wait(150);
        if (await tryClaim()) return 'ready' as const;
      }
      setStatus('blocked');
      return 'blocked' as const;
    },
    release(next: WebSqliteLockStatus = 'blocked') {
      release(next);
    },
    dispose() {
      unsubscribe();
      if (status === 'ready') release('blocked');
      listeners = [];
      host.dispose?.();
    },
  };
}

export function browserWebSqliteHost(id = createSessionId()): WebSqliteLockHost | null {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return null;
  const locks = navigator.locks;
  if (!locks?.request || typeof BroadcastChannel === 'undefined') return null;

  const channel = new BroadcastChannel(WEB_SQLITE_CHANNEL_NAME);
  return {
    id,
    async requestLock(name, options, callback) {
      await locks.request(name, options, callback);
    },
    subscribe(listener) {
      const onMessage = (event: MessageEvent<WebSqliteChannelMessage>) => listener(event.data);
      channel.addEventListener('message', onMessage);
      return () => channel.removeEventListener('message', onMessage);
    },
    publish(message) {
      channel.postMessage(message);
    },
    resetWorker() {
      const reset = (globalThis as { __EXPO_SQLITE_RESET_WORKER?: () => void }).__EXPO_SQLITE_RESET_WORKER;
      reset?.();
    },
    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
    dispose() {
      channel.close();
    },
  };
}

function createSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
