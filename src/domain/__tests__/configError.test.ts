import { ConfigurationError, isSettingsFocus, settingsActionLabel, settingsHref } from '../configError';

describe('configuration destinations', () => {
  it('builds typed settings hrefs without empty optional params', () => {
    expect(settingsHref({ kind: 'model', modelId: 'm', focus: 'capabilities' })).toEqual({
      pathname: '/model/[id]',
      params: { id: 'm', focus: 'capabilities' },
    });
    expect(settingsHref({ kind: 'model', modelId: 'm' })).toEqual({
      pathname: '/model/[id]',
      params: { id: 'm' },
    });
    expect(settingsHref({ kind: 'provider', providerId: 'p' })).toEqual({
      pathname: '/provider/[id]',
      params: { id: 'p' },
    });
    expect(settingsHref({ kind: 'models' })).toEqual({ pathname: '/models' });
  });

  it('labels the action from the destination', () => {
    expect(settingsActionLabel({ kind: 'model', modelId: 'm' })).toBe('Open model settings');
    expect(settingsActionLabel({ kind: 'provider', providerId: 'p' })).toBe('Open provider settings');
    expect(settingsActionLabel({ kind: 'models' })).toBe('Manage models');
  });

  it('accepts only known model-editor sections', () => {
    expect(isSettingsFocus('capabilities')).toBe(true);
    expect(isSettingsFocus('limits')).toBe(true);
    expect(isSettingsFocus('advanced')).toBe(true);
    expect(isSettingsFocus('identity')).toBe(false);
    expect(isSettingsFocus(undefined)).toBe(false);
  });

  it('preserves the destination on ConfigurationError', () => {
    const error = new ConfigurationError('Choose a model before sending.', { kind: 'models' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConfigurationError');
    expect(error.destination).toEqual({ kind: 'models' });
  });
});
