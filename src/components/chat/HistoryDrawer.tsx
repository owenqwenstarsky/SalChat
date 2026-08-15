import { useEffect, useState, type ComponentProps } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  conversationHasMessages,
  groupConversationsByRecency,
} from '@/domain/conversations';
import type { Conversation } from '@/domain/types';
import { font, radius, useTheme } from '@/theme';

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.86, 360);

export function HistoryDrawer({
  visible,
  conversations,
  messages,
  currentId,
  onClose,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  onOpenModels,
  onOpenAttachments,
  onOpenSettings,
}: {
  visible: boolean;
  conversations: Conversation[];
  messages: { conversationId: string }[];
  currentId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenModels: () => void;
  onOpenAttachments: () => void;
  onOpenSettings: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    Animated.timing(progress, { toValue: visible ? 1 : 0, duration: 240, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false);
        setQuery('');
        setRenaming(null);
      }
    });
  }, [progress, visible]);

  if (!mounted) return null;

  const visibleConversations = conversations
    .filter((item) => conversationHasMessages(item.id, messages))
    .filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const sections = groupConversationsByRecency(visibleConversations);

  const askDelete = (conversation: Conversation) => {
    Alert.alert('Delete chat?', 'This removes the conversation from this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(conversation.id) },
    ]);
  };

  return (
    <>
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { backgroundColor: theme.overlay, opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawer,
            {
              backgroundColor: theme.background,
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 8,
              transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-DRAWER_WIDTH, 0] }) }],
            },
          ]}
        >
          <View style={styles.top}>
            <Text style={[styles.brand, { color: theme.text }]}>Sal</Text>
            <Pressable accessibilityLabel="New chat" onPress={onNewChat} style={[styles.newChat, { backgroundColor: theme.surface }]}>
              <Ionicons name="create-outline" size={18} color={theme.text} />
            </Pressable>
          </View>
          <View style={[styles.search, { backgroundColor: theme.surface }]}>
            <Ionicons name="search" size={16} color={theme.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats"
              placeholderTextColor={theme.muted}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {sections.length === 0 ? (
              <Text style={[styles.empty, { color: theme.muted }]}>{query ? 'No matching chats.' : 'No chats yet.'}</Text>
            ) : (
              sections.map((section) => (
                <View key={section.key} style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.muted }]}>{section.title}</Text>
                  {section.items.map((conversation) => {
                    const active = conversation.id === currentId;
                    return (
                      <Pressable
                        key={conversation.id}
                        onPress={() => onSelect(conversation.id)}
                        onLongPress={() => {
                          Alert.alert(conversation.title, undefined, [
                            { text: 'Rename', onPress: () => { setRenaming(conversation); setDraftTitle(conversation.title); } },
                            { text: 'Delete', style: 'destructive', onPress: () => askDelete(conversation) },
                            { text: 'Cancel', style: 'cancel' },
                          ]);
                        }}
                        style={[styles.row, active && { backgroundColor: theme.accentSoft }]}
                      >
                        <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text }]}>{conversation.title}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: theme.line }]}>
            <FooterLink icon="layers-outline" label="Models" color={theme.text} onPress={onOpenModels} />
            <FooterLink icon="attach-outline" label="Attachments" color={theme.text} onPress={onOpenAttachments} />
            <FooterLink icon="settings-outline" label="Settings" color={theme.text} onPress={onOpenSettings} />
          </View>
        </Animated.View>
      </View>
    </Modal>
    <Modal visible={renaming !== null} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <Pressable style={[styles.renameBackdrop, { backgroundColor: theme.overlay }]} onPress={() => setRenaming(null)}>
          <Pressable style={[styles.renameCard, { backgroundColor: theme.surface }]} onPress={() => undefined}>
            <Text style={[styles.renameTitle, { color: theme.text }]}>Rename chat</Text>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              autoFocus
              style={[styles.renameInput, { color: theme.text, backgroundColor: theme.background }]}
            />
            <View style={styles.renameActions}>
              <Pressable onPress={() => setRenaming(null)}><Text style={[styles.renameAction, { color: theme.muted }]}>Cancel</Text></Pressable>
              <Pressable
                onPress={() => {
                  if (renaming && draftTitle.trim()) onRename(renaming.id, draftTitle.trim());
                  setRenaming(null);
                }}
              >
                <Text style={[styles.renameAction, { color: theme.accent }]}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function FooterLink({
  icon,
  label,
  color,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.footerLink}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.footerLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0, width: DRAWER_WIDTH, paddingHorizontal: 14 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 14 },
  brand: { fontSize: 22, fontFamily: font.bold, letterSpacing: -0.4 },
  newChat: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  search: { height: 40, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: font.regular },
  list: { flex: 1 },
  empty: { paddingHorizontal: 10, paddingVertical: 24, fontSize: 14, fontFamily: font.regular },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontFamily: font.semibold, paddingHorizontal: 10, marginBottom: 4 },
  row: { minHeight: 42, borderRadius: 12, paddingHorizontal: 10, justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontFamily: font.regular },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 2 },
  footerLink: { minHeight: 44, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerLabel: { fontSize: 15, fontFamily: font.semibold },
  renameBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  renameCard: { width: '100%', borderRadius: radius.lg, padding: 18 },
  renameTitle: { fontSize: 17, fontFamily: font.semibold, marginBottom: 12 },
  renameInput: { minHeight: 46, borderRadius: radius.md, paddingHorizontal: 12, fontSize: 16, fontFamily: font.regular },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 16 },
  renameAction: { fontSize: 15, fontFamily: font.semibold },
});
