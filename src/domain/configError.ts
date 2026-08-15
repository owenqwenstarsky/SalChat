export type SettingsFocus = 'capabilities' | 'limits' | 'advanced';

export type SettingsDestination =
  | { kind: 'model'; modelId: string; focus?: SettingsFocus }
  | { kind: 'provider'; providerId: string }
  | { kind: 'models' };

export class ConfigurationError extends Error {
  readonly destination: SettingsDestination;

  constructor(message: string, destination: SettingsDestination) {
    super(message);
    this.name = 'ConfigurationError';
    this.destination = destination;
  }
}

export function isSettingsFocus(value: string | undefined): value is SettingsFocus {
  return value === 'capabilities' || value === 'limits' || value === 'advanced';
}

export function settingsActionLabel(destination: SettingsDestination): string {
  if (destination.kind === 'model') return 'Open model settings';
  if (destination.kind === 'provider') return 'Open provider settings';
  return 'Manage models';
}

export type SettingsHref =
  | { pathname: '/model/[id]'; params: { id: string; focus: SettingsFocus } }
  | { pathname: '/model/[id]'; params: { id: string } }
  | { pathname: '/provider/[id]'; params: { id: string } }
  | { pathname: '/models' };

export function settingsHref(destination: SettingsDestination): SettingsHref {
  if (destination.kind === 'model') {
    return destination.focus
      ? { pathname: '/model/[id]', params: { id: destination.modelId, focus: destination.focus } }
      : { pathname: '/model/[id]', params: { id: destination.modelId } };
  }
  if (destination.kind === 'provider') {
    return { pathname: '/provider/[id]', params: { id: destination.providerId } };
  }
  return { pathname: '/models' };
}
