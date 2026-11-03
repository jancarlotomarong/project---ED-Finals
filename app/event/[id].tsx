import { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import { ErrorView, LoadingView } from '@/components/StateViews';
import { AttendanceStatusBadge, EventStateBadge } from '@/components/StatusBadge';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  countActiveStudents,
  getEventAttendance,
  getMyAttendanceForEvent,
  type AttendanceEntry,
  type AttendanceStatus,
} from '@/lib/attendance';
import {
  deleteEvent,
  getEventById,
  getEventState,
  setEventStatus,
  type CloudEvent,
} from '@/lib/events';
import { buildQRPayload } from '@/lib/qr';
import { supabase } from '@/lib/supabase';
import { confirmAction, formatDate, formatDateTime, formatTime, showMessage } from '@/lib/ui';
import { useLoader } from '@/lib/useLoader';

type Detail = {
  event: CloudEvent;
  canManage: boolean;
  attendees: AttendanceEntry[];
  totalStudents: number;
  myRecord: { scannedAt: string; status: AttendanceStatus } | null;
} | null;

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile, user } = useAuth();
  const [busy, setBusy] = useState(false);

  const { data, error, loading, refreshing, refresh, retry, reload } = useLoader<Detail>(
    async () => {
      if (!id || !user || !profile) return { data: null, error: 'Not signed in.' };

      const { event, error: eventError } = await getEventById(id);
      if (eventError) return { data: null, error: eventError };
      if (!event) return { data: null, error: 'Event not found.' };

      const canManage =
        profile.role === 'admin' || (profile.role === 'teacher' && event.created_by === user.id);

      if (canManage) {
        const [att, total] = await Promise.all([getEventAttendance(event.id), countActiveStudents()]);
        return {
          data: { event, canManage, attendees: att.data, totalStudents: total, myRecord: null },
          error: att.error,
        };
      }

      let myRecord: NonNullable<Detail>['myRecord'] = null;
      if (profile.role === 'student') {
        const mine = await getMyAttendanceForEvent(user.id, event.id);
        myRecord = mine.record;
      }
      return {
        data: { event, canManage, attendees: [], totalStudents: 0, myRecord },
        error: null,
      };
    },
    null
  );

  // REAL-TIME: EVENT "attendance row inserted/updated/deleted" ->
  // HANDLER -> ACTION reload the list -> RESULT teacher sees the scan instantly.
  const canManage = data?.canManage ?? false;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!canManage || !id) return;
    const channel = supabase
      .channel(`attendance-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance', filter: `event_id=eq.${id}` },
        () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => reload('focus'), 300);
        }
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [canManage, id, reload]);

  if (loading) return <LoadingView label="Loading event..." />;
  if (error && !data) return <ErrorView message={error} onRetry={retry} />;
  if (!data) return <ErrorView message="Event not found." onRetry={retry} />;

  const { event, attendees, totalStudents, myRecord } = data;
  const state = getEventState(event);
  const isAdmin = profile?.role === 'admin';

  const counted = attendees.filter((a) => a.status === 'present' || a.status === 'late').length;
  const percent = totalStudents > 0 ? Math.min(100, Math.round((counted / totalStudents) * 100)) : 0;

  // EVENT: "Close / Reopen event" pressed
  const handleToggleStatus = async () => {
    const closing = event.status === 'open';
    if (closing) {
      const ok = await confirmAction(
        'Close event?',
        'Students will no longer be able to record attendance for this event.',
        'Close event'
      );
      if (!ok) return;
    }
    setBusy(true);
    const { error: err } = await setEventStatus(event.id, closing ? 'closed' : 'open');
    setBusy(false);
    if (err) showMessage('Could not update event', err);
    else reload('focus');
  };

  // EVENT: "Delete event" pressed (admin only)
  const handleDelete = async () => {
    const ok = await confirmAction(
      'Delete event?',
      'This permanently deletes the event and ALL of its attendance records.',
      'Delete'
    );
    if (!ok) return;
    setBusy(true);
    const { error: err } = await deleteEvent(event.id);
    setBusy(false);
    if (err) showMessage('Could not delete event', err);
    else router.back();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />
      }
    >
      {error ? <Text style={styles.inlineError}>{error}</Text> : null}

      <Text style={styles.title}>{event.title}</Text>
      <EventStateBadge state={state} />

      <View style={styles.card}>
        <InfoRow icon="calendar-outline" label="Date" value={formatDate(event.start_time)} />
        <InfoRow
          icon="time-outline"
          label="Time"
          value={`${formatTime(event.start_time)} – ${formatTime(event.end_time)}`}
        />
        <InfoRow icon="location-outline" label="Venue" value={event.venue || '—'} />
        {event.description ? (
          <InfoRow icon="document-text-outline" label="Description" value={event.description} />
        ) : null}
        {data.canManage ? (
          <InfoRow icon="key-outline" label="Event code" value={event.event_code} />
        ) : null}
      </View>

      {/* ---------------- STUDENT VIEW ---------------- */}
      {profile?.role === 'student' && (
        <View style={styles.card}>
          {myRecord ? (
            <>
              <View style={styles.rowCenter}>
                <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                <Text style={styles.cardTitle}>Attendance recorded</Text>
              </View>
              <Text style={styles.muted}>{formatDateTime(myRecord.scannedAt)}</Text>
              <AttendanceStatusBadge status={myRecord.status} />
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>No attendance recorded</Text>
              <Text style={styles.muted}>
                {state === 'ongoing'
                  ? 'This event is ongoing. Scan the QR code to record your attendance.'
                  : state === 'upcoming'
                    ? 'This event has not started yet.'
                    : 'Attendance can no longer be recorded for this event.'}
              </Text>
              {state === 'ongoing' ? (
                <AppButton theme="primary" title="Scan QR Code" icon="qr-code-outline" onPress={() => router.push('/scan')} />
              ) : null}
            </>
          )}
        </View>
      )}

      {/* ---------------- TEACHER / ADMIN VIEW ---------------- */}
      {data.canManage && (
        <>
          <View style={[styles.card, styles.qrCard]}>
            <Text style={styles.cardTitle}>Event QR Code</Text>
            <View style={[styles.qrBox, event.status === 'closed' && styles.qrDim]}>
              <QRCode value={buildQRPayload(event.event_code)} size={220} />
            </View>
            <Text style={styles.muted}>
              {event.status === 'closed'
                ? 'Event is closed — scans are rejected.'
                : 'Students scan this code from the Scan tab.'}
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Attendance summary</Text>
              <View style={styles.live}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live</Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <Summary value={attendees.length} label="Scanned" />
              <Summary value={counted} label="Present/Late" />
              <Summary value={totalStudents > 0 ? `${percent}%` : '—'} label={`of ${totalStudents} students`} />
            </View>
          </View>

          <View style={styles.actions}>
            <AppButton
              title="Edit Event"
              icon="create-outline"
              onPress={() => router.push({ pathname: '/event-form', params: { id: event.id } })}
              disabled={busy}
            />
            <AppButton
              title={event.status === 'open' ? 'Close Event' : 'Reopen Event'}
              icon={event.status === 'open' ? 'lock-closed-outline' : 'lock-open-outline'}
              onPress={handleToggleStatus}
              disabled={busy}
            />
            {isAdmin ? (
              <AppButton title="Delete Event" icon="trash-outline" onPress={handleDelete} disabled={busy} />
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Attendees ({attendees.length})</Text>
          {attendees.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.muted}>No scans yet. They will appear here instantly.</Text>
            </View>
          ) : (
            attendees.map((a) => (
              <View key={a.id} style={styles.attRow}>
                <View style={styles.flex}>
                  <Text style={styles.attName}>{a.studentName}</Text>
                  <Text style={styles.muted}>
                    {a.studentNumber ? `${a.studentNumber} · ` : ''}
                    {formatDateTime(a.scannedAt)}
                  </Text>
                </View>
                <AttendanceStatusBadge status={a.status} />
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={COLORS.textSecondary} />
      <View style={styles.flex}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function Summary({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  inlineError: { color: COLORS.danger, fontSize: 13 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  muted: { fontSize: 13, color: COLORS.textSecondary },
  infoRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  infoLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase' },
  infoValue: { fontSize: 15, color: COLORS.textPrimary },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qrCard: { alignItems: 'center' },
  qrBox: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12 },
  qrDim: { opacity: 0.35 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  liveText: { fontSize: 12, fontWeight: '700', color: COLORS.success },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summary: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  summaryValue: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  summaryLabel: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },
  actions: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, marginTop: 8, textTransform: 'uppercase' },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  attName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
});
