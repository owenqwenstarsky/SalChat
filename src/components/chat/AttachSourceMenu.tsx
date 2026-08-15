import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { font, radius, useTheme } from '@/theme';

export type AttachSource = 'library' | 'files';

export function AttachSourceMenu({
  allowLibrary,
  allowFiles,
  includeImages,
  includeVideos,
  onChoose,
}: {
  allowLibrary: boolean;
  allowFiles: boolean;
  includeImages: boolean;
  includeVideos: boolean;
  onChoose: (source: AttachSource) => void;
}) {
  const theme = useTheme();
  const libraryDetail =
    includeImages && includeVideos ? 'Choose photos or videos' : includeVideos ? 'Choose videos' : 'Choose photos';
  return (
    <View style={styles.lift}>
      <View
        accessibilityRole="menu"
        accessibilityLabel="Attachment source"
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}
      >
        {allowLibrary ? (
          <SourceRow
            icon={includeImages ? 'images-outline' : 'videocam-outline'}
            label="Photo Library"
            detail={libraryDetail}
            onPress={() => onChoose('library')}
          />
        ) : null}
        {allowLibrary && allowFiles ? <View style={[styles.rule, { backgroundColor: theme.line }]} /> : null}
        {allowFiles ? (
          <SourceRow
            icon="folder-open-outline"
            label="Files"
            detail="Browse files on this device"
            onPress={() => onChoose('files')}
          />
        ) : null}
      </View>
    </View>
  );
}

function SourceRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.well }]}
    >
      <View style={[styles.icon, { backgroundColor: theme.well }]}>
        <Ionicons name={icon} size={20} color={theme.text} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.detail, { color: theme.muted }]}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lift: {
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    minHeight: 64,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontFamily: font.semibold },
  detail: { fontSize: 13, fontFamily: font.regular },
  rule: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
});
