import { secretStorage } from '../secretStorage.web';

describe('browser credential session storage', () => {
  const values = new Map<string, string>();
  const browserStorage = {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: jest.fn((key: string) => { values.delete(key); }),
  } as unknown as Storage;

  beforeEach(() => {
    values.clear();
    jest.clearAllMocks();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: browserStorage });
  });

  it('prefixes, resolves, and deletes tab-scoped secrets', async () => {
    await secretStorage.setItemAsync('api-key', 'secret');
    await expect(secretStorage.getItemAsync('api-key')).resolves.toBe('secret');
    expect(browserStorage.setItem).toHaveBeenCalledWith('sal-chat.secret.api-key', 'secret');
    await secretStorage.deleteItemAsync('api-key');
    await expect(secretStorage.getItemAsync('api-key')).resolves.toBeNull();
  });

  it('fails clearly outside a browser session', async () => {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: undefined });
    await expect(secretStorage.getItemAsync('api-key')).rejects.toThrow('browser session');
  });
});
