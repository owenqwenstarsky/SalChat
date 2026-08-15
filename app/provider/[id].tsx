import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@/components/Screen';
import { BrandIcon } from '@/components/BrandIcon';
import { Divider, Field, GhostButton, Group, PrimaryButton, SecretField, Section } from '@/components/UI';
import { adapterFor } from '@/adapters';
import { applyDetectedMetadata } from '@/domain/modelConfig';
import { createCredential, createModel } from '@/domain/factories';
import type { BrandLogo, IconSpec } from '@/domain/types';
import { resolveCredential, saveCredentialSecrets } from '@/storage/secrets';
import { useSalStore } from '@/state/store';
import { radius, space, useTheme } from '@/theme';
import { providerKindName } from '@/domain/labels';

export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const provider = useSalStore((state) => state.providers.find((item) => item.id === id));
  const allCredentials = useSalStore((state) => state.credentials);
  const allModels = useSalStore((state) => state.models);
  const credentials = useMemo(
    () => allCredentials.filter((item) => item.providerId === id),
    [allCredentials, id],
  );
  const models = useMemo(
    () => allModels.filter((item) => item.providerId === id),
    [allModels, id],
  );
  const saveCredential = useSalStore((state) => state.saveCredential);
  const saveProvider = useSalStore((state) => state.saveProvider);
  const saveModel = useSalStore((state) => state.saveModel);
  const deleteProvider = useSalStore((state) => state.deleteProvider);
  const [accountName, setAccountName] = useState('');
  const [key, setKey] = useState('');
  const [organization, setOrganization] = useState('');
  const [project, setProject] = useState('');
  const [headersText, setHeadersText] = useState('{}');
  const [wireId, setWireId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  if (!provider) return null;

  const selectedCredential = credentials.find((item) => item.id === provider.lastCredentialId) ?? credentials[0] ?? null;
  const test = async () => {
    setBusy('test');
    const result = await adapterFor(provider.kind).testConnection(provider, await resolveCredential(selectedCredential));
    setBusy(null);
    Alert.alert(result.ok ? 'Connection ready' : result.failure?.title ?? 'Connection failed', result.ok ? `${result.message} ${result.latencyMs} ms` : result.failure?.guidance ?? result.message);
  };
  const discover = async () => {
    setBusy('discover');
    try {
      const adapter = adapterFor(provider.kind);
      const credential = await resolveCredential(selectedCredential);
      const found = await adapter.listModels(provider, credential);
      let added = 0;
      for (const item of found) {
        if (models.some((model) => model.wireId === item.wireId)) continue;
        let model = createModel(provider, item.wireId, item.displayName);
        model = applyDetectedMetadata(model, item.metadata);
        const details = await adapter.inspectModel(provider, model, credential);
        model = applyDetectedMetadata(model, details);
        await saveModel(model); added++;
      }
      Alert.alert('Discovery complete', added ? `Added ${added} model${added === 1 ? '' : 's'}.` : 'All discovered models are already configured.');
    } catch (error) { Alert.alert('Discovery failed', error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  };
  const addAccount = async () => {
    if (!accountName.trim()) return;
    try {
      const headers = JSON.parse(headersText) as Record<string, string>;
      let credential = createCredential(provider.id, accountName.trim());
      credential = await saveCredentialSecrets(credential, { apiKey: key, organization, project, headers });
      await saveCredential(credential); setAccountName(''); setKey(''); setOrganization(''); setProject(''); setHeadersText('{}');
    } catch (error) { Alert.alert('Invalid account settings', error instanceof Error ? error.message : 'Custom headers must be a JSON object of names and values.'); }
  };
  const setProviderIcon = async (icon: IconSpec) => saveProvider({ ...provider, icon, updatedAt: new Date().toISOString() });
  const pickProviderIcon = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
    const asset = result.canceled ? null : result.assets[0];
    if (asset?.base64) await setProviderIcon({ type: 'asset', value: `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` });
  };
  const addModel = async () => {
    if (!wireId.trim()) return;
    const model = createModel(provider, wireId.trim());
    await saveModel(model); setWireId('');
    router.push({ pathname: '/model/[id]', params: { id: model.id } });
  };

  return (
    <Screen title={provider.displayName} onBack={() => router.back()}>
      <Text style={[styles.kind, { color: theme.muted }]}>{providerKindName(provider.kind)}</Text>
      <View style={[styles.endpoint, { backgroundColor: theme.surface }]}><BrandIcon icon={provider.icon} size={44} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.url, { color: theme.text }]}>{provider.baseUrl}</Text><Text style={[styles.meta, { color: theme.muted }]}>{credentials.length} accounts · {models.length} models</Text></View></View>
      <View style={styles.actions}><GhostButton compact onPress={() => void test()}>{busy === 'test' ? 'Testing…' : 'Test connection'}</GhostButton><PrimaryButton compact loading={busy === 'discover'} onPress={() => void discover()}>Discover models</PrimaryButton></View>
      <Section title="Provider icon" description="Use a bundled company mark, emoji, random emoji, or your own image.">
        <View style={styles.iconChoices}>{(['openai', 'anthropic', 'ollama', 'meta', 'litellm', 'generic'] as BrandLogo[]).map((logo) => <Pressable key={logo} onPress={() => void setProviderIcon({ type: 'logo', value: logo })} style={[styles.iconChoice, { borderColor: provider.icon.type === 'logo' && provider.icon.value === logo ? theme.accent : theme.line }]}><BrandIcon icon={{ type: 'logo', value: logo }} size={36} /></Pressable>)}<Pressable onPress={() => void setProviderIcon({ type: 'emoji', value: ['✦', '🧠', '🦙', '🌿', '⚡️'][Math.floor(Math.random() * 5)]! })} style={[styles.iconChoice, { borderColor: theme.line }]}><Text style={styles.random}>🎲</Text></Pressable><Pressable onPress={() => void pickProviderIcon()} style={[styles.iconChoice, { borderColor: theme.line }]}><Ionicons name="image-outline" size={22} color={theme.text} /></Pressable></View>
      </Section>
      <Section title="Accounts" description="Choose between these credentials directly from the chat composer.">
        <Group>{credentials.map((credential, index) => <View key={credential.id}>{index ? <Divider /> : null}<View style={styles.row}><Text style={[styles.avatar, { backgroundColor: theme.accentSoft, color: theme.accent }]}>{credential.displayName.slice(0, 1).toUpperCase()}</Text><View style={{ flex: 1 }}><Text style={[styles.name, { color: theme.text }]}>{credential.displayName}</Text><Text style={[styles.meta, { color: theme.muted }]}>{credential.apiKeyRef ? 'API key stored securely' : 'No API key'}</Text></View>{provider.lastCredentialId === credential.id ? <Text style={[styles.current, { color: theme.positive }]}>Last used</Text> : null}</View></View>)}</Group>
        <View style={styles.form}>
          <Field label="New account name" value={accountName} onChangeText={setAccountName} placeholder="Work" />
          <SecretField label="API key" value={key} onChangeText={setKey} placeholder="Optional" />
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}><Field label="Organization" value={organization} onChangeText={setOrganization} placeholder="Optional" /></View>
            <View style={{ flex: 1 }}><Field label="Project" value={project} onChangeText={setProject} placeholder="Optional" /></View>
          </View>
          <Field label="Custom authentication headers" value={headersText} onChangeText={setHeadersText} multiline autoCapitalize="none" autoCorrect={false} hint={'JSON object, for example {"X-API-Key":"…"}'} />
          <PrimaryButton compact disabled={!accountName.trim()} onPress={() => void addAccount()}>Add account</PrimaryButton>
        </View>
      </Section>
      <Section title="Models" description="Discovery is optional. Any wire model ID can be configured manually.">
        <Group>{models.map((model, index) => <View key={model.id}>{index ? <Divider /> : null}<Pressable style={styles.row} onPress={() => router.push({ pathname: '/model/[id]', params: { id: model.id } })}><BrandIcon icon={model.icon} size={36} /><View style={{ flex: 1 }}><Text style={[styles.name, { color: theme.text }]}>{model.displayName}</Text><Text style={[styles.meta, { color: theme.muted }]}>{model.wireId}</Text></View></Pressable></View>)}</Group>
        <View style={styles.form}><Field label="Manual model ID" value={wireId} onChangeText={setWireId} autoCapitalize="none" autoCorrect={false} placeholder="model-name:tag" /><PrimaryButton compact disabled={!wireId.trim()} onPress={() => void addModel()}>Add and configure</PrimaryButton></View>
      </Section>
      <GhostButton danger onPress={() => Alert.alert('Delete provider?', 'Models and credentials will be removed. Existing chat messages keep their provenance labels.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteProvider(provider.id).then(() => router.replace('/models')) }])}>Delete provider</GhostButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kind: { fontSize: 13, marginTop: -16, marginBottom: 16 },
  endpoint: { borderRadius: radius.lg, padding: 16, flexDirection: 'row', gap: 13, alignItems: 'center', marginBottom: 12 }, url: { fontWeight: '600', fontSize: 14 }, meta: { fontSize: 12, marginTop: 3 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 34 }, row: { minHeight: 64, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 12, textAlign: 'center', textAlignVertical: 'center', lineHeight: 36, fontWeight: '700' }, name: { fontSize: 15, fontWeight: '600' }, current: { fontSize: 11, fontWeight: '600' }, form: { marginTop: 18 },
  iconChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, iconChoice: { width: 48, height: 48, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, random: { fontSize: 21 }, twoCol: { flexDirection: 'row', gap: 10 },
});
