import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '@/constants/colors';
import type { EventState } from '@/lib/events';
import type { AttendanceStatus } from '@/lib/attendance';
import type { Role } from '@/lib/profiles';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_COLOR: Record<Tone, string> = {
  success: COLORS.success,
  warning: COLORS.warning,
  danger: COLORS.danger,
  info: COLORS.info,
  neutral: COLORS.textSecondary,
};

export default function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  const color = TONE_COLOR[tone];
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: color + '22' }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

export function EventStateBadge({ state }: { state: EventState }) {
  const map: Record<EventState, { label: string; tone: Tone }> = {
    ongoing: { label: 'Ongoing', tone: 'success' },
    upcoming: { label: 'Upcoming', tone: 'info' },
    ended: { label: 'Ended', tone: 'neutral' },
    closed: { label: 'Closed', tone: 'danger' },
  };
  return <StatusBadge {...map[state]} />;
}

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  const map: Record<AttendanceStatus, Tone> = {
    present: 'success',
    late: 'warning',
    absent: 'danger',
    excused: 'info',
  };
  return <StatusBadge label={status.charAt(0).toUpperCase() + status.slice(1)} tone={map[status]} />;
}

export function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, Tone> = { student: 'info', teacher: 'success', admin: 'warning' };
  return <StatusBadge label={role.charAt(0).toUpperCase() + role.slice(1)} tone={map[role]} />;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});
