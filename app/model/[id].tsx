import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View, type LayoutChangeEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { BrandIcon } from '@/components/BrandIcon';
import { KeyboardScroll } from '@/components/Screen';
import { Divider, Field, GhostButton, Group, Pill, PrimaryButton, Section } from '@/components/UI';
import { isSettingsFocus, type SettingsFocus } from '@/domain/configError';
import { validateRawRequestOverrides } from '@/domain/modelConfig';
import type { BrandLogo, IconSpec, Model, ModelCapabilities, ModelLimits } from '@/domain/types';
import { useSalStore } from '@/state/store';
import { space, useTheme } from '@/theme';

const CAPABILITIES: [keyof ModelCapabilities, string][] = [
  ['text', 'Text input and output'], ['image', 'Image input'], ['audio', 'Audio input'], ['video', 'Video input'],
  ['streaming', 'Streaming'], ['reasoning', 'Reasoning / thinking'], ['systemMessages', 'System messages'],
  ['stopSequences', 'Stop sequences'], ['temperature', 'Temperature'], ['maxOutputTokens', 'Max output tokens'],
  ['usageReporting', 'Token usage'], ['structuredOutput', 'Structured output'], ['toolCallRecognition', 'Tool-call recognition'],
];
const EMOJIS = ['✦', '🧠', '🦉', '🪶', '🌿', '🛰️', '🧩', '🦙', '🐋', '⚡️', '🔭', '🎛️'];
const LOGOS: BrandLogo[] = ['openai', 'anthropic', 'ollama', 'meta', 'litellm', 'generic'];

export default function ModelEditorScreen() {
  const { id, focus: focusParam } = useLocalSearchParams<{ id: string; focus?: string | string[] }>();
  const theme = useTheme();
  const stored = useSalStore((state) => state.models.find((item) => item.id === id));
  const provider = useSalStore((state) => state.providers.find((item) => item.id === stored?.providerId));
  const saveModel = useSalStore((state) => state.saveModel);
  const deleteModel = useSalStore((state) => state.deleteModel);
  const [draft, setDraft] = useState<Model | null>(() => stored ? JSON.parse(JSON.stringify(stored)) as Model : null);
  const [rawText, setRawText] = useState(() => JSON.stringify(stored?.rawRequestOverrides ?? {}, null, 2));
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const rawFocus = Array.isArray(focusParam) ? focusParam[0] : focusParam;
  const focus = isSettingsFocus(rawFocus) ? rawFocus : undefined;
  const [focusY, setFocusY] = useState<number | null>(null);
  const dirty = useMemo(() => draft && stored ? JSON.stringify(draft) !== JSON.stringify(stored) || rawText !== JSON.stringify(stored.rawRequestOverrides, null, 2) : false, [draft, rawText, stored]);
  useEffect(() => {
    if (focusY == null) return;
    scrollRef.current?.scrollTo({ y: focusY, animated: true });
  }, [focusY]);
  if (!draft || !provider) return null;

  const scrollToFocus = (section: SettingsFocus) => (event: LayoutChangeEvent) => {
    if (focus !== section) return;
    setFocusY(Math.max(0, event.nativeEvent.layout.y - 12));
  };

  const updateCapability = (key: keyof ModelCapabilities, mode: 'automatic' | 'supported' | 'unsupported') => {
    setDraft((current) => current ? ({ ...current, capabilities: { ...current.capabilities, [key]: { ...current.capabilities[key], mode, value: mode === 'automatic' ? current.capabilities[key].value : mode === 'supported', source: mode === 'automatic' ? 'unknown' : 'manual' } } }) : current);
  };
  const setLimit = (key: keyof ModelLimits, raw: string) => {
    const value = raw.trim() ? Number(raw) : null;
    setDraft((current) => current ? ({ ...current, limits: { ...current.limits, [key]: { ...current.limits[key], value: Number.isNaN(value) ? null : value, mode: 'supported', source: 'manual' } } }) : current);
  };
  const setMime = (key: 'imageMimeTypes' | 'audioMimeTypes' | 'videoMimeTypes', raw: string) => {
    const value = raw.split(',').map((item) => item.trim()).filter(Boolean);
    setDraft((current) => current ? ({ ...current, limits: { ...current.limits, [key]: { value, mode: 'supported', source: 'manual' } } }) : current);
  };
  const setIcon = (icon: IconSpec) => setDraft((current) => current ? { ...current, icon } : current);
  const pickIcon = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) { Alert.alert('Could not use image', 'The selected image could not be read.'); return; }
    setIcon({ type: 'asset', value: `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` });
  };
  const save = async () => {
    let raw: unknown;
    try { raw = JSON.parse(rawText); } catch { Alert.alert('Invalid JSON', 'Advanced request parameters must be valid JSON.'); return; }
    const result = validateRawRequestOverrides(raw);
    if (!result.valid) { Alert.alert('Request parameters need attention', result.errors.join('\n')); return; }
    setSaving(true);
    await saveModel({ ...draft, rawRequestOverrides: raw as Record<string, unknown>, updatedAt: new Date().toISOString() });
    setSaving(false); router.back();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.nav}><Pressable onPress={() => dirty ? Alert.alert('Discard changes?', 'Your model edits have not been saved.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => router.back() }]) : router.back()}><Ionicons name="chevron-back" size={24} color={theme.text} /></Pressable><Text style={[styles.navTitle, { color: theme.text }]}>Model</Text><PrimaryButton compact loading={saving} onPress={() => void save()}>Save</PrimaryButton></View>
      <KeyboardScroll ref={scrollRef} contentContainerStyle={styles.content}>
        <View style={styles.identity}><BrandIcon icon={draft.icon} size={52} /><View style={{ flex: 1 }}><Text style={[styles.hero, { color: theme.text }]}>{draft.displayName}</Text><Text style={[styles.provider, { color: theme.muted }]}>{provider.displayName}</Text></View></View>
        <Section title="Identity" description="The wire ID is sent exactly as written.">
          <Field label="Display name" value={draft.displayName} onChangeText={(displayName) => setDraft({ ...draft, displayName })} />
          <Field label="Wire model ID" value={draft.wireId} onChangeText={(wireId) => setDraft({ ...draft, wireId })} autoCapitalize="none" autoCorrect={false} />
          <Field label="Description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline placeholder="Optional notes about this model" />
          <Text style={[styles.label, { color: theme.text }]}>Logo</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choiceRow}>{LOGOS.map((logo) => <Pressable key={logo} onPress={() => setIcon({ type: 'logo', value: logo })} style={[styles.iconChoice, { borderColor: draft.icon.type === 'logo' && draft.icon.value === logo ? theme.accent : theme.line }]}><BrandIcon icon={{ type: 'logo', value: logo }} size={38} /></Pressable>)}</ScrollView>
          <Text style={[styles.label, { color: theme.text }]}>Emoji or custom image</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choiceRow}>{EMOJIS.map((emoji) => <Pill key={emoji} active={draft.icon.type === 'emoji' && draft.icon.value === emoji} onPress={() => setIcon({ type: 'emoji', value: emoji })}>{emoji}</Pill>)}<Pill onPress={() => setIcon({ type: 'emoji', value: EMOJIS[Math.floor(Math.random() * EMOJIS.length)]! })}>Random</Pill><Pill active={draft.icon.type === 'asset'} onPress={() => void pickIcon()}>Upload image</Pill></ScrollView>
          <View style={styles.switchRow}><View style={{ flex: 1 }}><Text style={[styles.name, { color: theme.text }]}>Enabled</Text><Text style={[styles.small, { color: theme.muted }]}>Disabled models remain configured but cannot be selected.</Text></View><Switch value={draft.enabled} onValueChange={(enabled) => setDraft({ ...draft, enabled })} trackColor={{ true: theme.accent }} /></View>
        </Section>

        <Section title="Capabilities" description="Automatic values use metadata when available. Manual On or Off always wins." onLayout={scrollToFocus('capabilities')}>
          <Group>{CAPABILITIES.map(([key, label], index) => { const field = draft.capabilities[key]; return <View key={key}>{index ? <Divider /> : null}<View style={styles.capability}><View style={{ flex: 1 }}><Text style={[styles.name, { color: theme.text }]}>{label}</Text><Text style={[styles.small, { color: theme.muted }]}>{field.mode === 'automatic' ? `Automatic · ${field.source}` : `Manual · ${field.value ? 'supported' : 'unsupported'}`}</Text></View><View style={styles.segment}>{(['automatic', 'supported', 'unsupported'] as const).map((mode) => <Pressable key={mode} onPress={() => updateCapability(key, mode)} style={[styles.segmentItem, { backgroundColor: field.mode === mode ? theme.accentSoft : 'transparent' }]}><Text style={[styles.segmentText, { color: field.mode === mode ? theme.accent : theme.muted }]}>{mode === 'automatic' ? 'A' : mode === 'supported' ? 'On' : 'Off'}</Text></Pressable>)}</View></View></View>; })}</Group>
        </Section>

        <Section title="Limits" description="Leave a numeric value blank when the provider’s limit is unknown." onLayout={scrollToFocus('limits')}>
          <View style={styles.twoCol}><View style={{ flex: 1 }}><Field label="Context window" keyboardType="number-pad" value={draft.limits.contextWindow.value?.toString() ?? ''} onChangeText={(value) => setLimit('contextWindow', value)} /></View><View style={{ flex: 1 }}><Field label="Max output" keyboardType="number-pad" value={draft.limits.maxOutputTokens.value?.toString() ?? ''} onChangeText={(value) => setLimit('maxOutputTokens', value)} /></View></View>
          <View style={styles.twoCol}><View style={{ flex: 1 }}><Field label="Max files" keyboardType="number-pad" value={draft.limits.maxAttachmentCount.value?.toString() ?? ''} onChangeText={(value) => setLimit('maxAttachmentCount', value)} /></View><View style={{ flex: 1 }}><Field label="Max file bytes" keyboardType="number-pad" value={draft.limits.maxFileBytes.value?.toString() ?? ''} onChangeText={(value) => setLimit('maxFileBytes', value)} /></View></View>
          <Field label="Max request bytes" keyboardType="number-pad" value={draft.limits.maxRequestBytes.value?.toString() ?? ''} onChangeText={(value) => setLimit('maxRequestBytes', value)} />
          <Field label="Image MIME types" value={draft.limits.imageMimeTypes.value.join(', ')} onChangeText={(value) => setMime('imageMimeTypes', value)} autoCapitalize="none" hint="Comma-separated" />
          <Field label="Audio MIME types" value={draft.limits.audioMimeTypes.value.join(', ')} onChangeText={(value) => setMime('audioMimeTypes', value)} autoCapitalize="none" />
          <Field label="Video MIME types" value={draft.limits.videoMimeTypes.value.join(', ')} onChangeText={(value) => setMime('videoMimeTypes', value)} autoCapitalize="none" />
          {(['acceptsRemoteUrls', 'acceptsDataUrls', 'resendsMediaInHistory'] as const).map((key) => <View style={styles.switchRow} key={key}><Text style={[styles.name, { color: theme.text, flex: 1 }]}>{key === 'acceptsRemoteUrls' ? 'Accepts remote URLs' : key === 'acceptsDataUrls' ? 'Accepts data URLs' : 'Resend media in history'}</Text><Switch value={draft.limits[key].value} onValueChange={(value) => setDraft({ ...draft, limits: { ...draft.limits, [key]: { value, mode: value ? 'supported' : 'unsupported', source: 'manual' } } })} trackColor={{ true: theme.accent }} /></View>)}
        </Section>

        <Section title="Generation defaults" description="A conversation may override these values.">
          <Field label="System prompt" value={draft.defaults.systemPrompt} onChangeText={(systemPrompt) => setDraft({ ...draft, defaults: { ...draft.defaults, systemPrompt } })} multiline />
          <View style={styles.twoCol}><View style={{ flex: 1 }}><Field label="Temperature" keyboardType="decimal-pad" value={draft.defaults.temperature?.toString() ?? ''} onChangeText={(value) => setDraft({ ...draft, defaults: { ...draft.defaults, temperature: value.trim() ? Number(value) : null } })} /></View><View style={{ flex: 1 }}><Field label="Max output" keyboardType="number-pad" value={draft.defaults.maxOutputTokens?.toString() ?? ''} onChangeText={(value) => setDraft({ ...draft, defaults: { ...draft.defaults, maxOutputTokens: value.trim() ? Number(value) : null } })} /></View></View>
          <Field label="Stop sequences" value={draft.defaults.stopSequences.join(', ')} onChangeText={(value) => setDraft({ ...draft, defaults: { ...draft.defaults, stopSequences: value.split(',').map((item) => item.trim()).filter(Boolean) } })} hint="Comma-separated" />
        </Section>

        <Section title="Advanced request parameters" description="Provider-specific JSON is merged without changing Sal’s model, messages, stream, or credential fields." onLayout={scrollToFocus('advanced')}>
          <Field label="JSON object" value={rawText} onChangeText={setRawText} multiline autoCapitalize="none" autoCorrect={false} style={styles.code} />
          <Field label="Compatibility notes" value={draft.compatibilityNotes} onChangeText={(compatibilityNotes) => setDraft({ ...draft, compatibilityNotes })} multiline placeholder="Required flags, known quirks, or server setup" />
        </Section>
        <GhostButton danger onPress={() => Alert.alert('Delete model?', 'Existing messages keep their saved provenance, but new chats cannot use this model.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteModel(draft.id).then(() => router.replace('/models')) }])}>Delete model</GhostButton>
      </KeyboardScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, nav: { height: 56, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, navTitle: { fontSize: 16, fontWeight: '600' }, content: { padding: space.xl, paddingBottom: 100 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 }, hero: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 }, provider: { fontSize: 13, marginTop: 3 }, label: { fontSize: 13, fontWeight: '600', marginBottom: 8 }, choiceRow: { marginBottom: 18 },
  iconChoice: { borderWidth: 1, borderRadius: 14, padding: 4, marginRight: 8 }, switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12 }, name: { fontSize: 14, fontWeight: '600' }, small: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  capability: { minHeight: 64, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9 }, segment: { flexDirection: 'row', gap: 2 }, segmentItem: { minWidth: 34, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, segmentText: { fontSize: 10, fontWeight: '700' },
  twoCol: { flexDirection: 'row', gap: 10 }, code: { fontFamily: 'monospace', fontSize: 13, minHeight: 150 },
});
