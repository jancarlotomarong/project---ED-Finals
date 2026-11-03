import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import StatCard from '@/components/StatCard';
import EventCard from '@/components/EventCard';
import { ErrorView, LoadingView } from '@/components/StateViews';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getNextEvent, getStudentStats, type StudentStats } from '@/lib/attendance';
import { getEventState, listEventsWithCounts, type CloudEvent, type EventWithCount } from '@/lib/events';
import { getSystemReport, type SystemReport } from '@/lib/admin';
import { useLoader } from '@/lib/useLoader';

function Shell({
  name,
  subtitle,
  refreshing,
  onRefresh,
  children,
}: {
  name: string;
  subtitle: string;
  refreshing: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        <Header title="QR Attendance" />
        <Text style={styles.mainTitle}>Hello, {name}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// STUDENT
// ---------------------------------------------------------------
function StudentHome({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const { data, error, loading, refreshing, refresh, retry } = useLoader<{
    stats: StudentStats | null;
    next: CloudEvent | null;
  }>(async () => {
    const [stats, next] = await Promise.all([getStudentStats(userId), getNextEvent()]);
    return {
      data: { stats: stats.data, next: next.event },
      error: stats.error ?? next.error,
    };
  }, { stats: null, next: null });

  if (loading) return <LoadingView />;
  if (error && !data.stats) return <ErrorView message={error} onRetry={retry} />;

  return (
    <Shell
      name={name}
      subtitle="Scan event QR codes to record your attendance."
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <View style={styles.statsRow}>
        <StatCard
          icon="checkbox-outline"
          value={`${data.stats?.attended ?? 0} / ${data.stats?.totalEvents ?? 0}`}
          label="Events Attended"
        />
        <StatCard icon="stats-chart-outline" value={`${data.stats?.rate ?? 0}%`} label="Attendance Rate" />
      </View>

      {data.next ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next event</Text>
          <EventCard
            event={data.next}
            onPress={() => router.push({ pathname: '/event/[id]', params: { id: data.next!.id } })}
          />
        </View>
      ) : (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>No upcoming events right now.</Text>
        </View>
      )}

      <View style={styles.actions}>
        <AppButton theme="primary" title="Scan QR Code" icon="qr-code-outline" onPress={() => router.push('/scan')} />
        <AppButton title="Browse Events" icon="calendar-outline" onPress={() => router.push('/events')} />
        <AppButton title="Attendance History" icon="time-outline" onPress={() => router.push('/history')} />
      </View>
    </Shell>
  );
}

// ---------------------------------------------------------------
// TEACHER
// ---------------------------------------------------------------
function TeacherHome({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const { data, error, loading, refreshing, refresh, retry } = useLoader<EventWithCount[]>(
    () => listEventsWithCounts(userId),
    []
  );

  if (loading) return <LoadingView />;
  if (error && data.length === 0) return <ErrorView message={error} onRetry={retry} />;

  const open = data.filter((e) => e.status === 'open').length;
  const checkIns = data.reduce((sum, e) => sum + e.attendeeCount, 0);
  const active = data.filter((e) => ['ongoing', 'upcoming'].includes(getEventState(e)));

  return (
    <Shell
      name={name}
      subtitle="Create events, share their QR code and monitor attendance."
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <View style={styles.statsRow}>
        <StatCard icon="calendar-outline" value={data.length} label="My Events" />
        <StatCard icon="radio-button-on-outline" value={open} label="Open Events" />
        <StatCard icon="checkmark-done-outline" value={checkIns} label="Total Check-ins" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ongoing & upcoming</Text>
        {active.length === 0 ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>No active events. Create one to get started.</Text>
          </View>
        ) : (
          active.slice(0, 3).map((ev) => (
            <EventCard
              key={ev.id}
              event={ev}
              attendeeCount={ev.attendeeCount}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: ev.id } })}
            />
          ))
        )}
      </View>

      <View style={styles.actions}>
        <AppButton theme="primary" title="Create Event" icon="add-circle-outline" onPress={() => router.push('/event-form')} />
        <AppButton title="My Events" icon="calendar-outline" onPress={() => router.push('/events')} />
        <AppButton title="Attendance Records" icon="clipboard-outline" onPress={() => router.push('/history')} />
      </View>
    </Shell>
  );
}

// ---------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------
function AdminHome({ name }: { name: string }) {
  const router = useRouter();
  const { data, error, loading, refreshing, refresh, retry } = useLoader<SystemReport | null>(
    async () => {
      const res = await getSystemReport();
      return { data: res.data, error: res.error };
    },
    null
  );

  if (loading) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={retry} />;

  return (
    <Shell
      name={name}
      subtitle="System overview for the whole campus."
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <Text style={styles.sectionTitle}>Users</Text>
      <View style={styles.statsRow}>
        <StatCard icon="school-outline" value={data?.students ?? 0} label="Students" />
        <StatCard icon="person-outline" value={data?.teachers ?? 0} label="Teachers" />
        <StatCard icon="shield-checkmark-outline" value={data?.admins ?? 0} label="Administrators" />
        <StatCard icon="ban-outline" value={data?.inactive_users ?? 0} label="Deactivated" />
      </View>

      <Text style={styles.sectionTitle}>Events & attendance</Text>
      <View style={styles.statsRow}>
        <StatCard icon="calendar-outline" value={data?.events_total ?? 0} label="Total Events" />
        <StatCard icon="radio-button-on-outline" value={data?.events_open ?? 0} label="Open" />
        <StatCard icon="lock-closed-outline" value={data?.events_closed ?? 0} label="Closed" />
        <StatCard icon="checkmark-done-outline" value={data?.attendance_total ?? 0} label="Total Check-ins" />
        <StatCard icon="flash-outline" value={data?.attendance_24h ?? 0} label="Check-ins (24h)" />
      </View>

      <View style={styles.actions}>
        <AppButton theme="primary" title="Manage Users" icon="people-outline" onPress={() => router.push('/users')} />
        <AppButton title="Manage Events" icon="calendar-outline" onPress={() => router.push('/events')} />
        <AppButton title="Attendance Records" icon="clipboard-outline" onPress={() => router.push('/history')} />
      </View>
    </Shell>
  );
}

export default function HomeScreen() {
  const { profile, user } = useAuth();
  if (!profile || !user) return null;
  const name = profile.full_name?.trim().split(' ')[0] || 'there';

  if (profile.role === 'admin') return <AdminHome name={name} />;
  if (profile.role === 'teacher') return <TeacherHome userId={user.id} name={name} />;
  return <StudentHome userId={user.id} name={name} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  mainTitle: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, marginTop: 20, marginBottom: 6 },
  subtitle: { fontSize: 15, lineHeight: 21, color: COLORS.textSecondary, marginBottom: 20 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  section: { gap: 10, marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 20,
  },
  infoText: { fontSize: 14, color: COLORS.textSecondary },
  actions: { gap: 12, marginTop: 4 },
});
