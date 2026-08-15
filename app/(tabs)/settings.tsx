import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '@/components/Screen';
import { Divider, GhostButton, Pill, PrimaryButton, Section } from '@/components/UI';
import { buildBackupArchive, inspectBackupArchive, restoreBackupArchive, writeBackupArchive } from '@/storage/backup';
import { useSalStore } from '@/state/store';
import { radius, space, useTheme } from '@/theme';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

export default function SettingsScreen() {
  const theme = useTheme();
  const state = useSalStore();
  const update = (patch: Partial<typeof state.settings>) => void state.saveSettings({ ...state.settings, ...patch });
  const exportBackup = async () => {
    try {
      const bytes = buildBackupArchive({ providers: state.providers, credentials: state.credentials, models: state.models, conversations: state.conversations, messages: state.messages, generations: state.generations, attachments: state.attachments, settings: state.settings });
      const uri = writeBackupArchive(bytes);
      await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'Export Sal Chat backup' });
    } catch (error) { Alert.alert('Export failed', error instanceof Error ? error.message : String(error)); }
  };
  const inspectImport = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    try {
      const manifest = inspectBackupArchive(new File(result.assets[0]!.uri).bytesSync());
      Alert.alert('Replace local data?', `This verified backup contains ${manifest.data.conversations.length} chats and ${manifest.data.attachments.length} unique attachments. Current Sal data will be replaced and credentials must be re-entered.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', style: 'destructive', onPress: () => void restoreBackupArchive(state.db!, new File(result.assets[0]!.uri).bytesSync()).then(() => state.hydrate(state.db!)).then(() => Alert.alert('Import complete', 'Chats, model configuration, icons, and attachments have been restored.')) },
      ]);
    } catch (error) { Alert.alert('Cannot import backup', error instanceof Error ? error.message : String(error)); }
  };
  return (
    <Screen title="Settings" eyebrow="Sal on this device">
      <Section title="Appearance">
        <Text style={[styles.label, { color: theme.muted }]}>COLOR SCHEME</Text><View style={styles.pills}>{(['system', 'light', 'dark'] as const).map((value) => <Pill key={value} active={state.settings.colorScheme === value} onPress={() => update({ colorScheme: value })}>{value[0]!.toUpperCase() + value.slice(1)}</Pill>)}</View>
        <Text style={[styles.label, { color: theme.muted }]}>MODEL REASONING</Text><View style={styles.pills}>{(['hidden', 'collapsed', 'expanded'] as const).map((value) => <Pill key={value} active={state.settings.reasoningVisibility === value} onPress={() => update({ reasoningVisibility: value })}>{value[0]!.toUpperCase() + value.slice(1)}</Pill>)}</View>
      </Section>
      <Section title="Behavior">
        <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.line }]}><SettingRow icon="phone-portrait-outline" title="Haptics" body="Use subtle feedback for sends and selections." value={state.settings.hapticsEnabled} onChange={(value) => update({ hapticsEnabled: value })} /><Divider /><SettingRow icon="terminal-outline" title="Provider error details" body="Keep redacted response bodies available for diagnosis." value={state.settings.diagnosticsIncludeProviderBody} onChange={(value) => update({ diagnosticsIncludeProviderBody: value })} /></View>
      </Section>
      <Section title="Backup and portability" description="Backups include settings, model configuration, chats, custom icons, and deduplicated media. API keys are never exported.">
        <View style={styles.backupActions}><PrimaryButton onPress={() => void exportBackup()}>Export complete backup</PrimaryButton><GhostButton onPress={() => void inspectImport()}>Import backup</GhostButton></View>
      </Section>
      <Section title="Storage"><View style={[styles.storage, { borderColor: theme.line }]}><Text style={[styles.storageNumber, { color: theme.text }]}>{state.conversations.length}</Text><Text style={[styles.storageLabel, { color: theme.muted }]}>chats</Text><Text style={[styles.storageNumber, { color: theme.text }]}>{state.models.length}</Text><Text style={[styles.storageLabel, { color: theme.muted }]}>models</Text><Text style={[styles.storageNumber, { color: theme.text }]}>{state.attachments.length}</Text><Text style={[styles.storageLabel, { color: theme.muted }]}>unique files</Text></View></Section>
      <Text style={[styles.foot, { color: theme.muted }]}>Sal Chat 1.0 · Direct connections, local history.</Text>
    </Screen>
  );
}

function SettingRow({ icon, title, body, value, onChange }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string; value: boolean; onChange: (value: boolean) => void }) {
  const theme = useTheme();
  return <View style={styles.setting}><Ionicons name={icon} size={21} color={theme.accent} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.settingBody, { color: theme.muted }]}>{body}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} /></View>;
}

const styles = StyleSheet.create({
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 9 }, pills: { flexDirection: 'row', marginBottom: 22 }, group: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' }, setting: { minHeight: 78, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingTitle: { fontSize: 14, fontWeight: '700' }, settingBody: { fontSize: 11, lineHeight: 16, marginTop: 3 }, backupActions: { gap: 10 }, storage: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 20, flexDirection: 'row', alignItems: 'baseline', gap: 7 }, storageNumber: { fontSize: 24, fontWeight: '800', marginLeft: 10 }, storageLabel: { fontSize: 11, marginRight: 7 }, foot: { fontSize: 11, textAlign: 'center', marginTop: 20 },
});
