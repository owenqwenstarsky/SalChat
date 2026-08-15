const PREFIX = 'sal-chat.secret.';

function storage(): Storage {
  if (typeof sessionStorage === 'undefined') {
    throw new Error('Credential storage is only available in a browser session.');
  }
  return sessionStorage;
}

export const secretStorage = {
  async getItemAsync(key: string): Promise<string | null> {
    return storage().getItem(`${PREFIX}${key}`);
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    storage().setItem(`${PREFIX}${key}`, value);
  },
  async deleteItemAsync(key: string): Promise<void> {
    storage().removeItem(`${PREFIX}${key}`);
  },
};
