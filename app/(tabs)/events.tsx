import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import AppButton from '@/components/AppButton';
import EventCard from '@/components/EventCard';
import { EmptyView, ErrorView, LoadingView } from '@/components/StateViews';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getAttendedEventIds } from '@/lib/attendance';
import {
  getEventState,
  listEvents,
  listEventsWithCounts,
  type EventWithCount,
} from '@/lib/events';
import { useLoader } from '@/lib/useLoader';

type Filter = 'active' | 'past' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

type Data = { events: EventWithCount[]; attended: Set<string> };

export default function EventsScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const isStudent = profile?.role === 'student';
  const isAdmin = profile?.role === 'admin';
  const [filter, setFilter] = useState<Filter>('active');

  const { data, error, loading, refreshing, refresh, retry } = useLoader<Data>(async () => {
    if (!user) return { data: { events: [], attended: new Set<string>() }, error: null };

    if (isStudent) {
      const [ev, att] = await Promise.all([listEvents(), getAttendedEventIds(user.id)]);
      return {
        data: {
          events: ev.data.map((e) => ({ ...e, attendeeCount: 0 })),
          attended: att.ids,
        },
        error: ev.error ?? att.error,
      };
    }
    // Teacher: own events. Admin: every event.
    const res = await listEventsWithCounts(isAdmin ? undefined : user.id);
    return { data: { events: res.data, attended: new Set<string>() }, error: res.error };
  }, { events: [], attended: new Set<string>() });

  const visible = useMemo(() => {
    return data.events.filter((e) => {
      const state = getEventState(e);
      if (filter === 'active') return state === 'ongoing' || state === 'upcoming';
      if (filter === 'past') return state === 'ended' || state === 'closed';
      return true;
    });
  }, [data.events, filter]);

  if (loading) return <LoadingView label="Loading events..." />;
  if (error && data.events.length === 0) return <ErrorView message={error} onRetry={retry} />;

  const header = (
    <View style={styles.header}>
      {!isStudent && (
        <AppButton
          theme="primary"
          title="Create Event"
          icon="add-circle-outline"
          onPress={() => router.push('/event-form')}
        />
      )}
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={visible}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />
      }
      ListEmptyComponent={
        <EmptyView
          icon="calendar-outline"
          title={filter === 'active' ? 'No active events' : 'No events found'}
          message={
            isStudent
              ? 'Events created by your teachers will appear here.'
              : 'Tap "Create Event" to add your first event.'
          }
        />
      }
      renderItem={({ item }) => (
        <EventCard
          event={item}
          attendeeCount={isStudent ? undefined : item.attendeeCount}
          attended={isStudent ? data.attended.has(item.id) : undefined}
          onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: COLORS.background },
  listContent: { padding: 16, gap: 12, flexGrow: 1 },
  header: { gap: 12, marginBottom: 4 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryMuted },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.primary },
  inlineError: { color: COLORS.danger, fontSize: 13 },
});
