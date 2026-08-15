import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { siAnthropic, siMeta, siOllama } from 'simple-icons';
import type { IconSpec } from '@/domain/types';

const icons = { anthropic: siAnthropic, ollama: siOllama, meta: siMeta };

export function BrandIcon({ icon, size = 42, background = '#E9E1D7' }: { icon: IconSpec; size?: number; background?: string }) {
  if (icon.type === 'asset') return <Image source={{ uri: icon.value }} style={{ width: size, height: size, borderRadius: size * 0.28 }} />;
  if (icon.type === 'emoji') return <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: background }]}><Text style={{ fontSize: size * 0.52 }}>{icon.value}</Text></View>;
  const brand = icon.value === 'generic' || icon.value === 'openai' ? null : icons[icon.value];
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: background }]}>
      {brand ? <Svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24"><Path d={brand.path} fill="#292522" /></Svg> : icon.value === 'openai' ? <OpenAiMark size={size * 0.58} /> : <Text style={{ fontSize: size * 0.42, fontWeight: '800' }}>S</Text>}
    </View>
  );
}

function OpenAiMark({ size }: { size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24">{[0, 60, 120, 180, 240, 300].map((angle) => { const radians = angle * Math.PI / 180; return <Circle key={angle} cx={12 + Math.cos(radians) * 5.3} cy={12 + Math.sin(radians) * 5.3} r="4.1" fill="none" stroke="#292522" strokeWidth="1.65" />; })}</Svg>;
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
