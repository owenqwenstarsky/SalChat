export interface UrlPolicyResult {
  valid: boolean;
  normalizedUrl?: string;
  requiresLanWarning: boolean;
  code?: 'invalid_url' | 'insecure_public_http' | 'unsupported_protocol';
  message?: string;
}

const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    PRIVATE_IPV4.some((pattern) => pattern.test(host))
  );
}

export function validateProviderUrl(input: string): UrlPolicyResult {
  const trimmed = input.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { valid: false, requiresLanWarning: false, code: 'invalid_url', message: 'Enter a complete URL, including http:// or https://.' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, requiresLanWarning: false, code: 'unsupported_protocol', message: 'Sal supports HTTP and HTTPS provider URLs.' };
  }
  const isPrivate = isPrivateHost(url.hostname);
  if (url.protocol === 'http:' && !isPrivate) {
    return {
      valid: false,
      requiresLanWarning: false,
      code: 'insecure_public_http',
      message: 'Public providers must use HTTPS so prompts and credentials are encrypted.',
    };
  }
  return {
    valid: true,
    normalizedUrl: trimmed,
    requiresLanWarning: url.protocol === 'http:',
    ...(url.hostname === 'localhost'
      ? { message: 'On a physical phone, localhost points to the phone. Use the provider computer’s LAN address.' }
      : {}),
  };
}

export function joinProviderPath(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (base.endsWith('/v1') && normalizedPath.startsWith('/v1/')) {
    return `${base}${normalizedPath.slice(3)}`;
  }
  return `${base}${normalizedPath}`;
}
