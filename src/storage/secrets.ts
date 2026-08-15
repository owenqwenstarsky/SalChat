import type { CredentialProfile } from '@/domain/types';
import type { ResolvedCredential } from '@/adapters/types';
import { secretStorage } from './secretStorage';

export const secretRef = (credentialId: string, field: string) => `sal.credential.${credentialId}.${field}`;
const RESERVED_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding']);

export function validateCustomHeaders(headers: Record<string, unknown>): Record<string, string> {
  const validated: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.trim();
    if (!normalized || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(normalized)) throw new Error(`“${name}” is not a valid HTTP header name.`);
    if (RESERVED_HEADERS.has(normalized.toLowerCase())) throw new Error(`“${normalized}” is controlled by Sal and cannot be customized.`);
    if (typeof value !== 'string') throw new Error(`The value for “${normalized}” must be a string.`);
    validated[normalized] = value;
  }
  return validated;
}

export async function saveCredentialSecrets(
  credential: CredentialProfile,
  values: { apiKey?: string; organization?: string; project?: string; headers?: Record<string, string> },
): Promise<CredentialProfile> {
  const next = { ...credential, headers: [...credential.headers], updatedAt: new Date().toISOString() };
  if (values.apiKey !== undefined) next.apiKeyRef = await saveOptional(secretRef(credential.id, 'apiKey'), values.apiKey);
  if (values.organization !== undefined) next.organizationRef = await saveOptional(secretRef(credential.id, 'organization'), values.organization);
  if (values.project !== undefined) next.projectRef = await saveOptional(secretRef(credential.id, 'project'), values.project);
  if (values.headers) {
    const validatedHeaders = validateCustomHeaders(values.headers);
    for (const existing of next.headers) await secretStorage.deleteItemAsync(existing.secretRef);
    next.headers = [];
    let index = 0;
    for (const [name, value] of Object.entries(validatedHeaders)) {
      if (!value) continue;
      const ref = secretRef(credential.id, `header.${index++}`);
      await secretStorage.setItemAsync(ref, value);
      next.headers.push({ name, secretRef: ref });
    }
  }
  return next;
}

async function saveOptional(ref: string, value: string): Promise<string | null> {
  if (!value.trim()) {
    await secretStorage.deleteItemAsync(ref);
    return null;
  }
  await secretStorage.setItemAsync(ref, value);
  return ref;
}

export async function resolveCredential(profile: CredentialProfile | null): Promise<ResolvedCredential> {
  if (!profile) return { profile: null, headers: {} };
  const headers: Record<string, string> = {};
  if (profile.apiKeyRef) {
    const key = await secretStorage.getItemAsync(profile.apiKeyRef);
    if (key) headers.Authorization = `Bearer ${key}`;
  }
  if (profile.organizationRef) {
    const value = await secretStorage.getItemAsync(profile.organizationRef);
    if (value) headers['OpenAI-Organization'] = value;
  }
  if (profile.projectRef) {
    const value = await secretStorage.getItemAsync(profile.projectRef);
    if (value) headers['OpenAI-Project'] = value;
  }
  for (const header of profile.headers) {
    if (!header.secretRef) continue;
    const value = await secretStorage.getItemAsync(header.secretRef);
    if (value) headers[header.name] = value;
  }
  return { profile, headers };
}

export async function deleteCredentialSecrets(profile: CredentialProfile): Promise<void> {
  const refs = [profile.apiKeyRef, profile.organizationRef, profile.projectRef, ...profile.headers.map((header) => header.secretRef)];
  await Promise.all(refs.filter((ref): ref is string => Boolean(ref)).map((ref) => secretStorage.deleteItemAsync(ref)));
}
