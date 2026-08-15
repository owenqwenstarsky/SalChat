import { useWindowDimensions } from 'react-native';

export const WIDE_BREAKPOINT = 900;
export const HISTORY_SIDEBAR_WIDTH = 280;
export const TRANSCRIPT_MAX_WIDTH = 760;
export const FORM_MAX_WIDTH = 720;

export function useShellLayout() {
  const { width } = useWindowDimensions();
  return { wide: width >= WIDE_BREAKPOINT, width };
}
