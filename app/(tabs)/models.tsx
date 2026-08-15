import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '@/components/Screen';
import { BrandIcon } from '@/components/BrandIcon';
import { Divider, EmptyState, PrimaryButton, Section } from '@/components/UI';
import { useSalStore } from '@/state/store';
import { radius, space, useTheme } from '@/theme';

export default function ModelsScreen() {
  const theme = useTheme();
  const providers = useSalStore((state) => state.providers);
  const models = useSalStore((state) => state.models);
  const credentials = useSalStore((state) => state.credentials);
  return (
    <Screen title="Models" eyebrow="Provider library" action={<Pressable accessibilityLabel="Add provider" onPress={() => router.push('/provider/new')} style={[styles.newIcon, { backgroundColor: theme.accent }]}><Ionicons name="add" size={24} color="#FFF" /></Pressable>}>
      {providers.length === 0 ? <EmptyState symbol="◉" title="Bring your own models" body="Connect a cloud API, Ollama, or llama.cpp. Each provider can hold multiple models and accounts." action={<PrimaryButton onPress={() => router.push('/provider/new')}>Add provider</PrimaryButton>} /> : providers.map((provider) => {
        const providerModels = models.filter((model) => model.providerId === provider.id);
        const accounts = credentials.filter((credential) => credential.providerId === provider.id);
        return (
          <Section key={provider.id} title={provider.displayName} description={`${providerKindName(provider.kind)} · ${accounts.length} account${accounts.length === 1 ? '' : 's'}`} action={<Pressable onPress={() => router.push({ pathname: '/provider/[id]', params: { id: provider.id } })}><Text style={[styles.manage, { color: theme.accent }]}>Manage</Text></Pressable>}>
            <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.line }]}>
              {providerModels.length ? providerModels.map((model, index) => <View key={model.id}>{index ? <Divider /> : null}<Pressable onPress={() => router.push({ pathname: '/model/[id]', params: { id: model.id } })} style={styles.row}><BrandIcon icon={model.icon} size={40} /><View style={{ flex: 1 }}><Text style={[styles.name, { color: theme.text }]}>{model.displayName}</Text><Text style={[styles.meta, { color: theme.muted }]}>{model.wireId} · {capabilitySummary(model)}</Text></View><Ionicons name="chevron-forward" size={18} color={theme.muted} /></Pressable></View>) : <View style={styles.emptyRow}><Text style={[styles.meta, { color: theme.muted }]}>No models yet. Discover or add one manually.</Text></View>}
            </View>
          </Section>
        );
      })}
    </Screen>
  );
}

export function providerKindName(kind: string): string {
  return ({ openai_chat: 'OpenAI Chat Completions', ollama_native: 'Ollama', ollama_openai_chat: 'Ollama · Chat Completions', llama_cpp: 'llama.cpp' } as Record<string, string>)[kind] ?? kind;
}

function capabilitySummary(model: ReturnType<typeof useSalStore.getState>['models'][number]): string {
  const media = ['image', 'audio', 'video'].filter((key) => model.capabilities[key as 'image' | 'audio' | 'video'].value);
  return media.length ? `text + ${media.join(' + ')}` : 'text';
}

const styles = StyleSheet.create({
  newIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, manage: { fontWeight: '800', fontSize: 13 },
  group: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' }, row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg },
  name: { fontSize: 15, fontWeight: '700', marginBottom: 3 }, meta: { fontSize: 12 }, emptyRow: { padding: 18 },
});
