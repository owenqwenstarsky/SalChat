import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BrandIcon } from '@/components/BrandIcon';
import { modelLabel } from '@/domain/labels';
import type { CredentialProfile, Model, Provider } from '@/domain/types';
import { font, radius, space, useTheme } from '@/theme';

export function ModelPicker({
  visible,
  models,
  providers,
  selectedModelId,
  accounts,
  selectedCredentialId,
  onClose,
  onChooseModel,
  onChooseAccount,
  onManage,
}: {
  visible: boolean;
  models: Model[];
  providers: Provider[];
  selectedModelId: string | null;
  accounts: CredentialProfile[];
  selectedCredentialId: string | null;
  onClose: () => void;
  onChooseModel: (model: Model) => void;
  onChooseAccount: (credentialId: string) => void;
  onManage: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const grouped = providers
    .map((provider) => ({ provider, models: models.filter((model) => model.providerId === provider.id) }))
    .filter((group) => group.models.length > 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.handle, { backgroundColor: theme.line }]} />
          <Text style={[styles.title, { color: theme.text }]}>Models</Text>
          {accounts.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accounts} contentContainerStyle={styles.accountRow}>
              {accounts.map((account) => {
                const active = account.id === selectedCredentialId;
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => onChooseAccount(account.id)}
                    style={[styles.account, { backgroundColor: active ? theme.accentSoft : theme.surface }]}
                  >
                    <Text style={[styles.accountText, { color: active ? theme.accent : theme.text }]}>{account.displayName}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          <ScrollView style={styles.list}>
            {grouped.map(({ provider, models: providerModels }) => (
              <View key={provider.id} style={styles.group}>
                <Text style={[styles.provider, { color: theme.muted }]}>{provider.displayName}</Text>
                {providerModels.map((model) => {
                  const selected = model.id === selectedModelId;
                  return (
                    <Pressable key={model.id} onPress={() => onChooseModel(model)} style={[styles.row, selected && { backgroundColor: theme.accentSoft }]}>
                      <BrandIcon icon={model.icon} size={36} />
                      <View style={styles.rowBody}>
                        <Text style={[styles.name, { color: theme.text }]}>{modelLabel(model)}</Text>
                        <Text style={[styles.meta, { color: theme.muted }]}>{model.wireId}</Text>
                      </View>
                      {selected ? <Ionicons name="checkmark" size={20} color={theme.accent} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <Pressable onPress={onManage} style={styles.manage}>
            <Text style={[styles.manageText, { color: theme.accent }]}>Manage models</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  // Keep the sheet above the full-screen backdrop on native platforms. Without
  // an explicit stacking order, the backdrop can receive row taps and close
  // the modal before the model's onPress runs.
  sheet: { zIndex: 1, elevation: 1, maxHeight: '78%', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 12 },
  title: { fontSize: 18, fontFamily: font.bold, paddingHorizontal: space.xl, marginBottom: 8 },
  accounts: { maxHeight: 52, marginBottom: 8 },
  accountRow: { paddingHorizontal: space.xl, gap: 8 },
  account: { height: 34, borderRadius: radius.pill, paddingHorizontal: 12, justifyContent: 'center' },
  accountText: { fontSize: 13, fontFamily: font.semibold },
  list: { paddingHorizontal: 10 },
  group: { marginBottom: 12 },
  provider: { fontSize: 12, fontFamily: font.semibold, paddingHorizontal: 14, paddingVertical: 8 },
  row: { minHeight: 58, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBody: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontFamily: font.semibold },
  meta: { fontSize: 12, fontFamily: font.regular },
  manage: { alignItems: 'center', paddingVertical: 14 },
  manageText: { fontSize: 15, fontFamily: font.semibold },
});
