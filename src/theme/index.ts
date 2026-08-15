import { useColorScheme } from 'react-native';
import { useSalStore } from '@/state/store';

export const palette = {
  cream: '#F5F0E8',
  paper: '#FCFAF6',
  ink: '#201D1A',
  muted: '#746E66',
  line: '#DED7CD',
  coral: '#E96D52',
  coralSoft: '#F8D7CE',
  moss: '#657153',
  dark: '#171615',
  darkRaised: '#211F1D',
  darkText: '#F5F0E8',
  darkMuted: '#AAA39A',
  darkLine: '#393531',
};

export const font = {
  regular: 'SourceSans3_400Regular',
  semibold: 'SourceSans3_600SemiBold',
  bold: 'SourceSans3_700Bold',
} as const;

export interface SalTheme {
  background: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  accentSoft: string;
  well: string;
  overlay: string;
  positive: string;
  danger: string;
  isDark: boolean;
}

export function useTheme(): SalTheme {
  const system = useColorScheme();
  const preference = useSalStore((state) => state.settings.colorScheme);
  const isDark = preference === 'dark' || (preference === 'system' && system === 'dark');
  return isDark
    ? {
        background: palette.dark,
        surface: palette.darkRaised,
        text: palette.darkText,
        muted: palette.darkMuted,
        line: palette.darkLine,
        accent: '#F08369',
        accentSoft: '#4A2B25',
        well: '#2A2724',
        overlay: 'rgba(0,0,0,0.46)',
        positive: '#91A87B',
        danger: '#FF8B78',
        isDark,
      }
    : {
        background: palette.cream,
        surface: palette.paper,
        text: palette.ink,
        muted: palette.muted,
        line: palette.line,
        accent: palette.coral,
        accentSoft: palette.coralSoft,
        well: '#E9E1D7',
        overlay: 'rgba(32,29,26,0.28)',
        positive: palette.moss,
        danger: '#B64135',
        isDark,
      };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
