import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import AppButton from '@/components/AppButton';

// The three feedback states every list screen needs:
// loading, empty data, error.

export function LoadingView({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyView({
  icon = 'file-tray-outline',
  title,
  message,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={COLORS.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </View>
  );
}

export function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name="alert-circle-outline" size={44} color={COLORS.danger} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? (
        <View style={styles.retry}>
          <AppButton title="Try again" icon="refresh-outline" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
  muted: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  retry: { alignSelf: 'stretch', marginTop: 12 },
});
