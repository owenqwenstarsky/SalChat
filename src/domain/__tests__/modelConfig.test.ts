import { applyDetectedMetadata, createDefaultCapabilities, createDefaultLimits, mergeRequestBody, setManualCapability, validateRawRequestOverrides } from '../modelConfig';
import type { Model } from '../types';

const model = (): Model => ({
  id: 'model-1', providerId: 'provider-1', wireId: 'test', displayName: 'Test', description: '',
  icon: { type: 'emoji', value: '🧪' }, enabled: true, favorite: false, sortOrder: 0,
  capabilities: createDefaultCapabilities('openai_chat'), limits: createDefaultLimits('openai_chat'),
  defaults: { systemPrompt: '', temperature: null, maxOutputTokens: null, stopSequences: [], reasoningMode: 'provider_default' },
  rawRequestOverrides: {}, compatibilityNotes: '', createdAt: '2026-01-01', updatedAt: '2026-01-01',
});

describe('model metadata precedence', () => {
  it('applies detected values to automatic fields', () => {
    const next = applyDetectedMetadata(model(), { capabilities: { image: true }, limits: { contextWindow: 128_000 } }, '2026-02-01');
    expect(next.capabilities.image).toMatchObject({ value: true, mode: 'automatic', source: 'detected' });
    expect(next.limits.contextWindow.value).toBe(128_000);
  });

  it('never replaces a manual capability during refresh', () => {
    const manual = setManualCapability(model(), 'image', false);
    const next = applyDetectedMetadata(manual, { capabilities: { image: true } });
    expect(next.capabilities.image).toMatchObject({ value: false, source: 'manual', mode: 'unsupported' });
  });
});

describe('advanced request parameters', () => {
  it('accepts provider-specific fields and keeps structural fields authoritative', () => {
    expect(validateRawRequestOverrides({ top_k: 40, seed: 5 }).valid).toBe(true);
    expect(mergeRequestBody({ model: 'safe' }, { top_p: 1 }, {}, {}, { top_k: 40 })).toEqual({ model: 'safe', top_p: 1, top_k: 40 });
  });

  it.each(['model', 'messages', 'stream', 'api_key', 'temperature'])('rejects protected field %s', (key) => {
    const result = validateRawRequestOverrides({ [key]: 'unsafe' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('managed by Sal');
  });

  it('rejects arrays and oversized payloads', () => {
    expect(validateRawRequestOverrides([]).valid).toBe(false);
    expect(validateRawRequestOverrides({ value: 'x'.repeat(65_000) }).valid).toBe(false);
  });
});
