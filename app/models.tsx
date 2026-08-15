import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '@/components/Screen';
import { BrandIcon } from '@/components/BrandIcon';
import { Divider, EmptyState, Group, PrimaryButton, Section } from '@/components/UI';
import { providerKindName } from '@/domain/labels';
import { useSalStore } from '@/state/store';
import { font, space, useTheme } from '@/theme';

export default function ModelsScreen() {
  const theme = useTheme();
  const providers = useSalStore((state) => state.providers);
  const models = useSalStore((state) => state.models);
  const credentials = useSalStore((state) => state.credentials);
  return (
    <Screen
      title="Models"
      onBack={() => router.back()}
      action={
        <Pressable accessibilityLabel="Add provider" onPress={() => router.push('/provider/new')} style={styles.add}>
          <Ionicons name="add" size={24} color={theme.text} />
        </Pressable>
      }
    >
      {providers.length === 0 ? (
        <EmptyState
          title="Bring your own models"
          body="Connect a cloud API, Ollama, or llama.cpp. Each provider can hold multiple models and accounts."
          action={<PrimaryButton onPress={() => router.push('/provider/new')}>Add provider</PrimaryButton>}
        />
      ) : (
        providers.map((provider) => {
          const providerModels = models.filter((model) => model.providerId === provider.id);
          const accounts = credentials.filter((credential) => credential.providerId === provider.id);
          return (
            <Section
              key={provider.id}
              title={provider.displayName}
              description={`${providerKindName(provider.kind)} · ${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
              action={
                <Pressable onPress={() => router.push({ pathname: '/provider/[id]', params: { id: provider.id } })}>
                  <Text style={[styles.manage, { color: theme.accent }]}>Manage</Text>
                </Pressable>
              }
            >
              <Group>
                {providerModels.length ? (
                  providerModels.map((model, index) => (
                    <View key={model.id}>
                      {index ? <Divider /> : null}
                      <Pressable onPress={() => router.push({ pathname: '/model/[id]', params: { id: model.id } })} style={styles.row}>
                        <BrandIcon icon={model.icon} size={36} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.name, { color: theme.text }]}>{model.displayName}</Text>
                          <Text style={[styles.meta, { color: theme.muted }]}>{model.wireId} · {capabilitySummary(model)}</Text>
                        </View>
                      </Pressable>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyRow}>
                    <Text style={[styles.meta, { color: theme.muted }]}>No models yet. Discover or add one manually.</Text>
                  </View>
                )}
              </Group>
            </Section>
          );
        })
      )}
    </Screen>
  );
}

function capabilitySummary(model: ReturnType<typeof useSalStore.getState>['models'][number]): string {
  const media = ['image', 'audio', 'video'].filter((key) => model.capabilities[key as 'image' | 'audio' | 'video'].value);
  return media.length ? `text + ${media.join(' + ')}` : 'text';
}

const styles = StyleSheet.create({
  add: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  manage: { fontFamily: font.semibold, fontSize: 14 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg },
  name: { fontSize: 15, fontFamily: font.semibold, marginBottom: 2 },
  meta: { fontSize: 12, fontFamily: font.regular },
  emptyRow: { padding: 18 },
});
