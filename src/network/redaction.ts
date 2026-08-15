const SENSITIVE_HEADER = /authorization|api[-_]?key|token|secret|cookie|organization|project/i;

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, SENSITIVE_HEADER.test(key) ? '••••••••' : value]));
}

export function redactText(text: string, secrets: string[] = []): string {
  let output = text.replace(/(bearer\s+)[a-z0-9._~+\/-]+/gi, '$1••••••••');
  output = output.replace(/("?(?:api[_-]?key|token|secret|authorization)"?\s*[:=]\s*"?)[^",\s}]+/gi, '$1••••••••');
  for (const secret of secrets.filter((item) => item.length >= 4)) output = output.split(secret).join('••••••••');
  return output;
}

export function redactDiagnostic(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === 'string') return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactDiagnostic(item, secrets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, SENSITIVE_HEADER.test(key) ? '••••••••' : redactDiagnostic(child, secrets)]),
    );
  }
  return value;
}
