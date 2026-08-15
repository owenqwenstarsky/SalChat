import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { BrandIcon } from '@/components/BrandIcon';
import { AssistantText } from '@/components/AssistantText';
import { Pill } from '@/components/UI';
import { createConversation, createId } from '@/domain/factories';
import type { Message, MessagePart, Model } from '@/domain/types';
import { sendMessage, stopGeneration } from '@/chat/engine';
import { importAttachment } from '@/storage/attachments';
import { useSalStore } from '@/state/store';
import { radius, space, useTheme } from '@/theme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Message>>(null);
  const conversation = useSalStore((state) => state.conversations.find((item) => item.id === id));
  const allMessages = useSalStore((state) => state.messages);
  const allModels = useSalStore((state) => state.models);
  const messages = useMemo(
    () => allMessages.filter((item) => item.conversationId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [allMessages, id],
  );
  const models = useMemo(
    () => allModels.filter((item) => item.enabled),
    [allModels],
  );
  const providers = useSalStore((state) => state.providers);
  const credentials = useSalStore((state) => state.credentials);
  const attachments = useSalStore((state) => state.attachments);
  const settings = useSalStore((state) => state.settings);
  const saveConversation = useSalStore((state) => state.saveConversation);
  const saveMessage = useSalStore((state) => state.saveMessage);
  const saveAttachment = useSalStore((state) => state.saveAttachment);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  useEffect(() => { if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })); }, [messages]);
  if (!conversation) return null;
  const model = models.find((item) => item.id === conversation.selectedModelId) ?? null;
  const provider = providers.find((item) => item.id === model?.providerId) ?? null;
  const providerAccounts = credentials.filter((item) => item.providerId === provider?.id);
  const selectedCredential = providerAccounts.find((item) => item.id === conversation.selectedCredentialId) ?? providerAccounts.find((item) => item.id === provider?.lastCredentialId) ?? null;

  const chooseModel = async (next: Model) => {
    const incompatible = incompatibleAttachments(next, messages, attachments);
    if (incompatible.length) {
      Alert.alert('This history contains unsupported media', `${next.displayName} is not configured for ${incompatible.join(', ')} input.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Configure model', onPress: () => router.push({ pathname: '/model/[id]', params: { id: next.id } }) },
        { text: 'Fork text-only', onPress: () => void forkTextOnly(next) },
      ]);
      return;
    }
    const nextProvider = providers.find((item) => item.id === next.providerId);
    await saveConversation({ ...conversation, selectedModelId: next.id, selectedCredentialId: nextProvider?.lastCredentialId ?? null, updatedAt: new Date().toISOString() });
    setShowModels(false);
  };

  const forkTextOnly = async (next: Model) => {
    const nextProvider = providers.find((item) => item.id === next.providerId);
    const fork = { ...createConversation(next.id), title: `${conversation.title} · text fork`, selectedCredentialId: nextProvider?.lastCredentialId ?? null, systemPrompt: conversation.systemPrompt };
    await saveConversation(fork);
    for (const message of messages) {
      const parts = message.parts.filter((part) => part.type === 'text').map((part) => ({ ...part }));
      if (!parts.length) continue;
      const copy: Message = { ...message, id: createId(), conversationId: fork.id, parts, status: 'complete', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await saveMessage(copy);
    }
    router.replace({ pathname: '/chat/[id]', params: { id: fork.id } });
  };

  const chooseAccount = async (credentialId: string) => {
    await saveConversation({ ...conversation, selectedCredentialId: credentialId, updatedAt: new Date().toISOString() });
    setShowAccounts(false);
  };

  const pickAttachment = async () => {
    if (!model) return;
    const types = [...(model.capabilities.image.value ? model.limits.imageMimeTypes.value : []), ...(model.capabilities.audio.value ? model.limits.audioMimeTypes.value : []), ...(model.capabilities.video.value ? model.limits.videoMimeTypes.value : [])];
    if (!types.length) { Alert.alert('Text-only model', 'Enable an attachment capability in this model’s configuration first.'); return; }
    const result = await DocumentPicker.getDocumentAsync({ type: types.length ? types : '*/*', multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    if (!useSalStore.getState().db) return;
    const imported: string[] = [];
    for (const asset of result.assets) {
      try {
        const blob = await importAttachment(useSalStore.getState().db!, { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream', ...(asset.size !== undefined ? { size: asset.size } : {}) });
        await saveAttachment(blob); imported.push(blob.id);
      } catch (error) { Alert.alert('Could not attach file', error instanceof Error ? error.message : String(error)); }
    }
    setPending((current) => [...new Set([...current, ...imported])]);
  };

  const submit = async () => {
    if ((!text.trim() && !pending.length) || !model || sending) return;
    const outgoing = text; const outgoingAttachments = pending;
    setText(''); setPending([]); setSending(true);
    if (settings.hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { await sendMessage({ conversationId: conversation.id, text: outgoing, attachmentIds: outgoingAttachments }); }
    catch (error) { setText(outgoing); setPending(outgoingAttachments); Alert.alert('Cannot send', error instanceof Error ? error.message : String(error)); }
    finally { setSending(false); }
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.line }]}>
        <Pressable accessibilityLabel="Back to chats" onPress={() => router.back()}><Ionicons name="chevron-back" size={27} color={theme.text} /></Pressable>
        <Pressable style={styles.titleWrap} onPress={() => setShowModels((value) => !value)}><BrandIcon icon={model?.icon ?? { type: 'emoji', value: '✦' }} size={34} /><View><Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{conversation.title}</Text><Text style={[styles.subtitle, { color: theme.muted }]}>{model?.displayName ?? 'Choose model'} · {selectedCredential?.displayName ?? 'No key'}</Text></View></Pressable>
        <Pressable accessibilityLabel="Conversation settings" onPress={() => router.push(model ? { pathname: '/model/[id]', params: { id: model.id } } : '/(tabs)/models')}><Ionicons name="options-outline" size={23} color={theme.text} /></Pressable>
      </View>
      {showModels ? <View style={[styles.picker, { backgroundColor: theme.background, borderBottomColor: theme.line }]}><Text style={[styles.pickerLabel, { color: theme.muted }]}>MODEL</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{models.map((item) => <Pill key={item.id} active={item.id === model?.id} onPress={() => void chooseModel(item)}>{item.displayName}</Pill>)}</ScrollView></View> : null}
      {showAccounts ? <View style={[styles.picker, { backgroundColor: theme.background, borderBottomColor: theme.line }]}><Text style={[styles.pickerLabel, { color: theme.muted }]}>ACCOUNT</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{providerAccounts.map((item) => <Pill key={item.id} active={item.id === selectedCredential?.id} onPress={() => void chooseAccount(item.id)}>{item.displayName}</Pill>)}</ScrollView></View> : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <FlatList ref={listRef} data={messages} keyExtractor={(item) => item.id} contentContainerStyle={[styles.messages, !messages.length && styles.center]} renderItem={({ item }) => <MessageView message={item} />} ListEmptyComponent={<View style={styles.welcome}><Text style={styles.spark}>✦</Text><Text style={[styles.welcomeTitle, { color: theme.text }]}>Ready when you are.</Text><Text style={[styles.welcomeBody, { color: theme.muted }]}>Messages go directly to {provider?.displayName ?? 'your selected provider'}.</Text></View>} />
        <View style={[styles.composerArea, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: theme.line, backgroundColor: theme.background }]}>
          {pending.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pending}>{pending.map((attachmentId) => { const item = attachments.find((blob) => blob.id === attachmentId); return item ? <Pressable key={item.id} onPress={() => setPending((current) => current.filter((id) => id !== item.id))} style={[styles.fileChip, { backgroundColor: theme.accentSoft }]}><Ionicons name={item.modality === 'image' ? 'image-outline' : item.modality === 'audio' ? 'musical-notes-outline' : 'videocam-outline'} size={15} color={theme.accent} /><Text numberOfLines={1} style={[styles.fileName, { color: theme.accent }]}>{item.originalName}</Text><Ionicons name="close" size={14} color={theme.accent} /></Pressable> : null; })}</ScrollView> : null}
          <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.line }]}>
            <TextInput value={text} onChangeText={setText} multiline placeholder={model ? `Message ${model.displayName}` : 'Choose a model'} placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text }]} />
            <View style={styles.composerActions}><Pressable accessibilityLabel="Add attachment" onPress={() => void pickAttachment()} style={styles.round}><Ionicons name="add" size={24} color={theme.muted} /></Pressable>{providerAccounts.length > 1 ? <Pressable accessibilityLabel="Choose account" onPress={() => setShowAccounts((value) => !value)} style={styles.keyButton}><Ionicons name="key-outline" size={16} color={theme.muted} /><Text style={[styles.keyText, { color: theme.muted }]}>{selectedCredential?.displayName ?? 'Account'}</Text></Pressable> : <View />}{sending ? <Pressable accessibilityLabel="Stop response" onPress={() => stopGeneration(conversation.id)} style={[styles.send, { backgroundColor: theme.text }]}><Ionicons name="stop" size={17} color={theme.background} /></Pressable> : <Pressable accessibilityLabel="Send message" disabled={!model || (!text.trim() && !pending.length)} onPress={() => void submit()} style={[styles.send, { backgroundColor: model && (text.trim() || pending.length) ? theme.accent : theme.line }]}><Ionicons name="arrow-up" size={19} color="#FFF" /></Pressable>}</View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageView({ message }: { message: Message }) {
  const theme = useTheme();
  const settings = useSalStore((state) => state.settings);
  const generations = useSalStore((state) => state.generations);
  const [reasoningOpen, setReasoningOpen] = useState(settings.reasoningVisibility === 'expanded');
  const generation = generations.find((item) => item.messageId === message.id);
  const user = message.role === 'user';
  const text = message.parts.filter((part): part is Extract<MessagePart, { type: 'text' }> => part.type === 'text').map((part) => part.text).join('');
  const reasoning = message.parts.filter((part): part is Extract<MessagePart, { type: 'reasoning' }> => part.type === 'reasoning').map((part) => part.text).join('');
  const files = message.parts.filter((part): part is Extract<MessagePart, { type: 'attachment' }> => part.type === 'attachment');
  return <View style={[styles.message, user && styles.userMessage]}>{files.length ? <View style={styles.messageFiles}>{files.map((file) => <View key={file.attachmentId} style={[styles.inlineFile, { borderColor: theme.line }]}><Ionicons name="attach" color={theme.muted} size={14} /><Text numberOfLines={1} style={[styles.inlineFileText, { color: theme.muted }]}>{file.name}</Text></View>)}</View> : null}{reasoning && settings.reasoningVisibility !== 'hidden' ? <Pressable onPress={() => setReasoningOpen((value) => !value)} style={[styles.reasoning, { borderColor: theme.line }]}><View style={styles.reasoningHead}><Ionicons name="sparkles-outline" size={15} color={theme.muted} /><Text style={[styles.reasoningLabel, { color: theme.muted }]}>Reasoning</Text><Ionicons name={reasoningOpen ? 'chevron-up' : 'chevron-down'} size={14} color={theme.muted} /></View>{reasoningOpen ? <Text style={[styles.reasoningText, { color: theme.muted }]}>{reasoning}</Text> : null}</Pressable> : null}<View style={user ? [styles.userBubble, { backgroundColor: theme.accentSoft }] : undefined}>{text ? user ? <Text style={[styles.userText, { color: theme.text }]}>{text}</Text> : <AssistantText>{text}</AssistantText> : null}</View>{!user && generation ? <Text style={[styles.provenance, { color: theme.muted }]}>{generation.provenance.modelName}{generation.provenance.credentialName ? ` · ${generation.provenance.credentialName}` : ''}{generation.totalTokens ? ` · ${generation.totalTokens} tokens` : ''}</Text> : null}</View>;
}

function incompatibleAttachments(model: Model, messages: Message[], attachments: ReturnType<typeof useSalStore.getState>['attachments']): string[] {
  const ids = messages.flatMap((message) => message.parts.filter((part) => part.type === 'attachment').map((part) => part.attachmentId));
  const modalities = new Set(ids.map((id) => attachments.find((item) => item.id === id)?.modality).filter(Boolean));
  return [...modalities].filter((modality) => modality && !model.capabilities[modality].value) as string[];
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, header: { minHeight: 62, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { fontSize: 15, fontWeight: '800', maxWidth: 220 }, subtitle: { fontSize: 11, marginTop: 2 },
  picker: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth }, pickerLabel: { fontSize: 9, letterSpacing: 1.3, fontWeight: '900', marginBottom: 8 }, messages: { paddingHorizontal: 18, paddingVertical: 24, gap: 24 }, center: { flexGrow: 1, justifyContent: 'center' }, welcome: { alignItems: 'center', paddingHorizontal: 36 }, spark: { fontSize: 42, marginBottom: 18 }, welcomeTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 }, welcomeBody: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 7 },
  message: { maxWidth: '92%', alignSelf: 'flex-start' }, userMessage: { alignSelf: 'flex-end', maxWidth: '84%' }, userBubble: { borderRadius: 20, borderBottomRightRadius: 7, paddingHorizontal: 16, paddingVertical: 12 }, userText: { fontSize: 16, lineHeight: 22 }, provenance: { fontSize: 10, marginTop: 6 },
  reasoning: { borderLeftWidth: 2, paddingLeft: 10, marginBottom: 10 }, reasoningHead: { flexDirection: 'row', alignItems: 'center', gap: 6 }, reasoningLabel: { fontSize: 12, fontWeight: '700', flex: 1 }, reasoningText: { fontSize: 13, lineHeight: 19, marginTop: 8 }, messageFiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 7 }, inlineFile: { borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, maxWidth: 180 }, inlineFileText: { fontSize: 11, flexShrink: 1 },
  composerArea: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth }, pending: { marginBottom: 7 }, fileChip: { maxWidth: 210, height: 34, borderRadius: 11, paddingHorizontal: 9, marginRight: 6, flexDirection: 'row', alignItems: 'center', gap: 5 }, fileName: { flexShrink: 1, fontSize: 11, fontWeight: '700' },
  composer: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 8 }, input: { minHeight: 36, maxHeight: 130, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' }, composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, round: { width: 36, height: 34, alignItems: 'center', justifyContent: 'center' }, keyButton: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }, keyText: { fontSize: 11, fontWeight: '700' }, send: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
