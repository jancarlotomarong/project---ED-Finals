import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

import AppButton from '@/components/AppButton';
import { EmptyView } from '@/components/StateViews';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { registerAttendance, type RegisterCode, type RegisterResult } from '@/lib/attendance';
import { formatDateTime } from '@/lib/ui';

type IconName = keyof typeof Ionicons.glyphMap;

// One distinct message for every outcome the scanner can produce.
const RESULT_UI: Record<RegisterCode, { icon: IconName; color: string; title: string }> = {
  ok: { icon: 'checkmark-circle', color: COLORS.success, title: 'Attendance recorded' },
  duplicate: { icon: 'alert-circle', color: COLORS.warning, title: 'Already recorded' },
  closed: { icon: 'lock-closed', color: COLORS.danger, title: 'Event closed' },
  not_started: { icon: 'time', color: COLORS.warning, title: 'Event not started' },
  ended: { icon: 'hourglass', color: COLORS.warning, title: 'Event has ended' },
  invalid_qr: { icon: 'close-circle', color: COLORS.danger, title: 'Invalid QR code' },
  unauthorized: { icon: 'hand-left', color: COLORS.danger, title: 'Not allowed' },
  error: { icon: 'cloud-offline', color: COLORS.danger, title: 'Something went wrong' },
};

export default function ScanScreen() {
  const { profile } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const busy = useRef(false); // ref = instant guard (state updates are async)

  if (profile && profile.role !== 'student') {
    return (
      <EmptyView
        icon="lock-closed-outline"
        title="Students only"
        message="Only student accounts can scan an event QR code to record attendance."
      />
    );
  }

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Camera Access Needed</Text>
        <Text style={styles.subtitle}>Grant camera permission to scan attendance QR codes.</Text>
        <AppButton theme="primary" title="Grant Permission" icon="camera-outline" onPress={requestPermission} />
      </View>
    );
  }

  // EVENT: scanner detected a QR code
  // HANDLER: handleBarcodeScanned -> ACTION: registerAttendance (server validates)
  // RESULT: success / duplicate / closed / invalid card
  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (busy.current) return;
    busy.current = true;
    setProcessing(true);
    registerAttendance(data)
      .then(setResult)
      .finally(() => setProcessing(false));
  };

  const scanAgain = () => {
    busy.current = false;
    setResult(null);
  };

  const ui = result ? RESULT_UI[result.code] : null;

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={result || processing ? undefined : handleBarcodeScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.card}>
          {processing ? (
            <>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.hint}>Checking QR code...</Text>
            </>
          ) : result && ui ? (
            <>
              <Ionicons name={ui.icon} size={44} color={ui.color} style={styles.icon} />
              <Text style={[styles.message, { color: ui.color }]}>{ui.title}</Text>
              {result.eventTitle ? <Text style={styles.eventTitle}>{result.eventTitle}</Text> : null}
              <Text style={styles.detail}>{result.message}</Text>
              {result.success && result.scannedAt ? (
                <Text style={styles.detail}>{formatDateTime(result.scannedAt)}</Text>
              ) : null}
              <AppButton theme="primary" title="Scan Again" icon="scan-outline" onPress={scanAgain} />
            </>
          ) : (
            <Text style={styles.hint}>Point the camera at an event QR code</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  camera: { flex: 1 },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  centered: { flex: 1, backgroundColor: COLORS.background, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 8 },
  hint: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  icon: { alignSelf: 'center' },
  message: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  eventTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center' },
  detail: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
});
