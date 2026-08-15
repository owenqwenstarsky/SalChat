import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Field, Pill, PrimaryButton } from '@/components/UI';
import { createCredential, createProvider } from '@/domain/factories';
import type { ProviderKind } from '@/domain/types';
import { validateProviderUrl } from '@/network/urlPolicy';
import { saveCredentialSecrets } from '@/storage/secrets';
import { useSalStore } from '@/state/store';
import { space, useTheme } from '@/theme';

const KINDS: { kind: ProviderKind; label: string; url: string }[] = [
  { kind: 'openai_chat', label: 'OpenAI format', url: 'https://api.openai.com/v1' },
  { kind: 'ollama_native', label: 'Ollama', url: 'http://192.168.1.10:11434' },
  { kind: 'ollama_openai_chat', label: 'Ollama · Chat', url: 'http://192.168.1.10:11434/v1' },
  { kind: 'llama_cpp', label: 'llama.cpp', url: 'http://192.168.1.10:8080/v1' },
];

export default function NewProviderScreen() {
  const theme = useTheme();
  const [kind, setKind] = useState<ProviderKind>('openai_chat');
  const selected = useMemo(() => KINDS.find((item) => item.kind === kind)!, [kind]);
  const [displayName, setDisplayName] = useState('OpenAI');
  const [baseUrl, setBaseUrl] = useState(selected.url);
  const [accountName, setAccountName] = useState('Personal');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const saveProvider = useSalStore((state) => state.saveProvider);
  const saveCredential = useSalStore((state) => state.saveCredential);

  const chooseKind = (next: ProviderKind) => {
    const preset = KINDS.find((item) => item.kind === next)!;
    setKind(next); setBaseUrl(preset.url);
    setDisplayName(next === 'ollama_native' || next === 'ollama_openai_chat' ? 'Ollama' : next === 'llama_cpp' ? 'llama.cpp' : 'OpenAI');
  };

  const save = async () => {
    const policy = validateProviderUrl(baseUrl);
    if (!displayName.trim() || !policy.valid || !policy.normalizedUrl) { Alert.alert('Check provider details', policy.message ?? 'Add a display name and valid URL.'); return; }
    if (policy.requiresLanWarning) {
      const accepted = await confirmLanWarning();
      if (!accepted) return;
    }
    setSaving(true);
    try {
      let provider = createProvider(kind, displayName.trim(), policy.normalizedUrl);
      if (accountName.trim() || apiKey.trim()) {
        let credential = createCredential(provider.id, accountName.trim() || 'Default');
        credential = await saveCredentialSecrets(credential, { apiKey });
        provider = { ...provider, lastCredentialId: credential.id };
        await saveCredential(credential);
      }
      await saveProvider(provider);
      router.replace({ pathname: '/provider/[id]', params: { id: provider.id } });
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.nav}><Pressable onPress={() => router.back()}><Ionicons name="close" size={27} color={theme.text} /></Pressable><Text style={[styles.navTitle, { color: theme.text }]}>Add provider</Text><View style={{ width: 27 }} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={[styles.step, { color: theme.muted }]}>Protocol</Text>
        <Text style={[styles.hero, { color: theme.text }]}>How does this provider speak?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pills}>{KINDS.map((item) => <Pill key={item.kind} active={kind === item.kind} onPress={() => chooseKind(item.kind)}>{item.label}</Pill>)}</ScrollView>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="My provider" />
        <Field label="Base URL" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" hint="Public URLs must use HTTPS. Private LAN HTTP endpoints show a one-time warning." />
        <Text style={[styles.step, { color: theme.muted }]}>First account</Text>
        <Field label="Account name" value={accountName} onChangeText={setAccountName} placeholder="Personal, Work, Team…" />
        <Field label="API key" value={apiKey} onChangeText={setApiKey} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder={kind.includes('ollama') || kind === 'llama_cpp' ? 'Optional for local providers' : 'sk-…'} hint="Stored in the device secure keychain and never included in backups." />
        <PrimaryButton loading={saving} onPress={() => void save()}>Create provider</PrimaryButton>
      </ScrollView>
    </SafeAreaView>
  );
}

function confirmLanWarning(): Promise<boolean> {
  return new Promise((resolve) => Alert.alert('Local HTTP connection', 'Prompts sent over HTTP are not encrypted. Only continue for a private network you trust.', [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Continue', onPress: () => resolve(true) }]));
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, nav: { height: 56, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, navTitle: { fontWeight: '600', fontSize: 16 },
  content: { padding: space.xl, paddingBottom: 80 }, step: { fontSize: 13, fontWeight: '600', marginBottom: 6 }, hero: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4, marginBottom: 18 }, pills: { marginBottom: 26, marginHorizontal: -space.xl, paddingHorizontal: space.xl },
});
