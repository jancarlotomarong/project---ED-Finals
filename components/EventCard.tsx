import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import { getEventState, type CloudEvent } from '@/lib/events';
import { formatDateTime } from '@/lib/ui';
import { EventStateBadge } from '@/components/StatusBadge';

type Props = {
  event: CloudEvent;
  onPress: () => void;
  attendeeCount?: number; // staff view
  attended?: boolean; // student view
};

export default function EventCard({ event, onPress, attendeeCount, attended }: Props) {
  const state = getEventState(event);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        {attendeeCount !== undefined ? (
          <View style={styles.count}>
            <Text style={styles.countText}>{attendeeCount}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.badges}>
        <EventStateBadge state={state} />
        {attended ? (
          <View style={styles.attended}>
            <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
            <Text style={styles.attendedText}>Attended</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.meta}>
        <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
        <Text style={styles.metaText}>{formatDateTime(event.start_time)}</Text>
      </View>
      {event.venue ? (
        <View style={styles.meta}>
          <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{event.venue}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  count: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 8,
    backgroundColor: COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: COLORS.primary, fontWeight: '700', fontSize: 16 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  attended: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  attendedText: { fontSize: 12, fontWeight: '600', color: COLORS.success },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: COLORS.textSecondary },
});
