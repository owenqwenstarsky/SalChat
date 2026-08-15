import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { siAnthropic, siMeta, siOllama } from 'simple-icons';
import type { IconSpec } from '@/domain/types';
import { useTheme } from '@/theme';

const icons = { anthropic: siAnthropic, ollama: siOllama, meta: siMeta };

export function BrandIcon({ icon, size = 42, background }: { icon: IconSpec; size?: number; background?: string }) {
  const theme = useTheme();
  const fill = background ?? theme.well;
  if (icon.type === 'asset') return <Image source={{ uri: icon.value }} style={{ width: size, height: size, borderRadius: size * 0.28 }} />;
  if (icon.type === 'emoji') return <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: fill }]}><Text style={{ fontSize: size * 0.52 }}>{icon.value}</Text></View>;
  const brand = icon.value === 'generic' || icon.value === 'openai' || icon.value === 'litellm' ? null : icons[icon.value];
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: fill }]}>
      {brand ? <Svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24"><Path d={brand.path} fill={theme.text} /></Svg> : icon.value === 'openai' ? <OpenAiMark size={size * 0.58} color={theme.text} /> : icon.value === 'litellm' ? <LiteLlmMark size={size * 0.58} color={theme.text} /> : <Text style={{ fontSize: size * 0.42, fontWeight: '700', color: theme.text }}>S</Text>}
    </View>
  );
}

function OpenAiMark({ size, color }: { size: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24">{[0, 60, 120, 180, 240, 300].map((angle) => { const radians = angle * Math.PI / 180; return <Circle key={angle} cx={12 + Math.cos(radians) * 5.3} cy={12 + Math.sin(radians) * 5.3} r="4.1" fill="none" stroke={color} strokeWidth="1.65" />; })}</Svg>;
}

function LiteLlmMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.5 16.2 12 5.4l7.5 10.8" fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
      <Path d="M7.4 16.2h9.2" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <Path d="M9.2 12.6h5.6" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
