import type { ComponentProps } from 'react';
import { Alert, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '@/components/Screen';
import { Divider, GhostButton, Group, Pill, PrimaryButton, Section } from '@/components/UI';
import { buildBackupArchive, downloadBackupArchive, inspectBackupArchive, readBackupArchive, restoreBackupArchive, writeBackupArchive } from '@/storage/backup';
import { useSalStore } from '@/state/store';
import { font, space, useTheme } from '@/theme';
import * as DocumentPicker from 'expo-document-picker';

export default function SettingsScreen() {
  const theme = useTheme();
  const state = useSalStore();
  const update = (patch: Partial<typeof state.settings>) => void state.saveSettings({ ...state.settings, ...patch });
  const exportBackup = async () => {
    try {
      const bytes = buildBackupArchive({
        providers: state.providers,
        credentials: state.credentials,
        models: state.models,
        conversations: state.conversations,
        messages: state.messages,
        generations: state.generations,
        attachments: state.attachments,
        settings: state.settings,
      });
      if (Platform.OS === 'web') {
        downloadBackupArchive(bytes);
      } else {
        const uri = writeBackupArchive(bytes);
        await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'Export Sal Chat backup' });
      }
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : String(error));
    }
  };
  const inspectImport = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    try {
      const bytes = await readBackupArchive(result.assets[0]!.uri);
      const manifest = inspectBackupArchive(bytes);
      Alert.alert(
        'Replace local data?',
        `This verified backup contains ${manifest.data.conversations.length} chats and ${manifest.data.attachments.length} unique attachments. Current Sal data will be replaced and credentials must be re-entered.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            style: 'destructive',
            onPress: () =>
              void restoreBackupArchive(state.db!, bytes)
                .then(() => state.hydrate(state.db!))
                .then(() => Alert.alert('Import complete', 'Chats, model configuration, icons, and attachments have been restored.')),
          },
        ],
      );
    } catch (error) {
      Alert.alert('Cannot import backup', error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Screen title="Settings" onBack={() => router.back()}>
      <Section title="Appearance">
        <Text style={[styles.label, { color: theme.muted }]}>Color scheme</Text>
        <View style={styles.pills}>
          {(['system', 'light', 'dark'] as const).map((value) => (
            <Pill key={value} active={state.settings.colorScheme === value} onPress={() => update({ colorScheme: value })}>
              {value[0]!.toUpperCase() + value.slice(1)}
            </Pill>
          ))}
        </View>
        <Text style={[styles.label, { color: theme.muted }]}>Model reasoning</Text>
        <View style={styles.pills}>
          {(['hidden', 'collapsed', 'expanded'] as const).map((value) => (
            <Pill key={value} active={state.settings.reasoningVisibility === value} onPress={() => update({ reasoningVisibility: value })}>
              {value[0]!.toUpperCase() + value.slice(1)}
            </Pill>
          ))}
        </View>
      </Section>
      <Section title="Behavior">
        <Group>
          <SettingRow
            icon="phone-portrait-outline"
            title="Haptics"
            body="Use subtle feedback for sends and selections."
            value={state.settings.hapticsEnabled}
            onChange={(value) => update({ hapticsEnabled: value })}
          />
          <Divider />
          <SettingRow
            icon="terminal-outline"
            title="Provider error details"
            body="Keep redacted response bodies available for diagnosis."
            value={state.settings.diagnosticsIncludeProviderBody}
            onChange={(value) => update({ diagnosticsIncludeProviderBody: value })}
          />
        </Group>
        <Text style={[styles.contextLabel, { color: theme.muted }]}>Default context management</Text>
        <View style={styles.pills}>
          {(['automatic', 'manual'] as const).map((value) => (
            <Pill key={value} active={state.settings.contextManagementDefault === value} onPress={() => update({ contextManagementDefault: value })}>
              {value === 'automatic' ? 'Automatic' : 'Manual only'}
            </Pill>
          ))}
        </View>
        <Text style={[styles.contextHint, { color: theme.muted }]}>Chats can inherit this setting or override it. Automatic mode compacts around 75% of a known model window.</Text>
      </Section>
      <Section title="Backup" description="Backups include settings, models, chats, icons, and media. API keys are never exported.">
        <View style={styles.backupActions}>
          <PrimaryButton onPress={() => void exportBackup()}>Export backup</PrimaryButton>
          <GhostButton onPress={() => void inspectImport()}>Import backup</GhostButton>
        </View>
      </Section>
      <Section title="On this device">
        <View style={styles.storage}>
          <Stat value={state.conversations.length} label="chats" />
          <Stat value={state.models.length} label="models" />
          <Stat value={state.attachments.length} label="files" />
        </View>
      </Section>
      <Text style={[styles.foot, { color: theme.muted }]}>Sal Chat 1.0 · Direct connections, local history.</Text>
    </Screen>
  );
}

function SettingRow({
  icon,
  title,
  body,
  value,
  onChange,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.setting}>
      <Ionicons name={icon} size={20} color={theme.muted} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.settingBody, { color: theme.muted }]}>{body}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} />
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.storageNumber, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.storageLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontFamily: font.semibold, marginBottom: 8 },
  pills: { flexDirection: 'row', marginBottom: 20 },
  contextLabel: { fontSize: 12, fontFamily: font.semibold, marginTop: 18, marginBottom: 8 },
  contextHint: { fontSize: 12, lineHeight: 17, fontFamily: font.regular, marginTop: -10 },
  setting: { minHeight: 72, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingTitle: { fontSize: 15, fontFamily: font.semibold },
  settingBody: { fontSize: 12, lineHeight: 16, marginTop: 3, fontFamily: font.regular },
  backupActions: { gap: 10 },
  storage: { flexDirection: 'row', gap: 18 },
  stat: { gap: 2 },
  storageNumber: { fontSize: 22, fontFamily: font.bold },
  storageLabel: { fontSize: 12, fontFamily: font.regular },
  foot: { fontSize: 12, textAlign: 'center', marginTop: 16, fontFamily: font.regular },
});
