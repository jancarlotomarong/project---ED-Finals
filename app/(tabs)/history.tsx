import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import AppButton from '@/components/AppButton';
import { EmptyView, ErrorView, LoadingView } from '@/components/StateViews';
import { AttendanceStatusBadge, EventStateBadge } from '@/components/StatusBadge';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  ATTENDANCE_STATUSES,
  deleteAttendance,
  getAttendanceHistory,
  getEventsWithAttendance,
  updateAttendance,
  type AttendanceEntry,
  type AttendanceRecord,
  type AttendanceStatus,
  type EventAttendance,
} from '@/lib/attendance';
import { getEventState } from '@/lib/events';
import { confirmAction, formatDate, formatDateTime, formatTime, showMessage } from '@/lib/ui';
import { useLoader } from '@/lib/useLoader';

// ---------------------------------------------------------------
// STUDENT: own attendance history
// ---------------------------------------------------------------
function StudentHistory({ userId }: { userId: string }) {
  const { data, error, loading, refreshing, refresh, retry } = useLoader<AttendanceRecord[]>(
    () => getAttendanceHistory(userId),
    []
  );

  if (loading) return <LoadingView label="Loading records..." />;
  if (error && data.length === 0) return <ErrorView message={error} onRetry={retry} />;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={data}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />}
      ListEmptyComponent={
        <EmptyView icon="time-outline" title="No records yet" message="Scan an event QR code to record your attendance." />
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{item.eventTitle}</Text>
            <AttendanceStatusBadge status={item.status} />
          </View>
          {item.venue ? <Text style={styles.muted}>{item.venue}</Text> : null}
          <Text style={styles.muted}>
            {formatDate(item.scannedAt)} · {formatTime(item.scannedAt)}
          </Text>
        </View>
      )}
    />
  );
}

// ---------------------------------------------------------------
// TEACHER / ADMIN: attendance per event (admin can correct records)
// ---------------------------------------------------------------
function StaffHistory({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AttendanceEntry | null>(null);

  const { data, error, loading, refreshing, refresh, retry, reload } = useLoader<EventAttendance[]>(
    () => getEventsWithAttendance(isAdmin ? undefined : userId),
    []
  );

  if (loading) return <LoadingView label="Loading attendance..." />;
  if (error && data.length === 0) return <ErrorView message={error} onRetry={retry} />;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalCheckIns = data.reduce((sum, e) => sum + e.attendees.length, 0);

  return (
    <>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={data}
        keyExtractor={(item) => item.event.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          data.length > 0 ? (
            <Text style={styles.summaryLine}>
              {data.length} event{data.length === 1 ? '' : 's'} · {totalCheckIns} check-in
              {totalCheckIns === 1 ? '' : 's'}
              {isAdmin ? ' · tap a record to correct it' : ''}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyView
            icon="clipboard-outline"
            title="No events yet"
            message="Create an event to start collecting attendance."
          />
        }
        renderItem={({ item }) => {
          const open = expanded.has(item.event.id);
          return (
            <View style={styles.card}>
              <Pressable onPress={() => toggle(item.event.id)} style={styles.cardHeader}>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{item.event.title}</Text>
                  <Text style={styles.muted}>{formatDateTime(item.event.start_time)}</Text>
                  <View style={styles.badgeRow}>
                    <EventStateBadge state={getEventState(item.event)} />
                  </View>
                </View>
                <View style={styles.count}>
                  <Text style={styles.countText}>{item.attendees.length}</Text>
                </View>
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={COLORS.textSecondary}
                />
              </Pressable>

              {open && (
                <View style={styles.attList}>
                  <View style={styles.divider} />
                  {item.attendees.length === 0 ? (
                    <Text style={styles.empty}>No scans yet</Text>
                  ) : (
                    item.attendees.map((a) => (
                      <Pressable
                        key={a.id}
                        disabled={!isAdmin}
                        onPress={() => setEditing(a)}
                        style={styles.attRow}
                      >
                        <View style={styles.flex}>
                          <Text style={styles.attName}>{a.studentName}</Text>
                          <Text style={styles.muted}>
                            {a.studentNumber ? `${a.studentNumber} · ` : ''}
                            {formatDateTime(a.scannedAt)}
                          </Text>
                          {a.remarks ? <Text style={styles.remarks}>“{a.remarks}”</Text> : null}
                        </View>
                        <AttendanceStatusBadge status={a.status} />
                      </Pressable>
                    ))
                  )}
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/event/[id]', params: { id: item.event.id } })
                    }
                    style={styles.openLink}
                  >
                    <Text style={styles.openLinkText}>Open event</Text>
                    <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />

      {editing && (
        <CorrectionModal
          entry={editing}
          adminId={userId}
          onClose={() => setEditing(null)}
          onChanged={() => {
            setEditing(null);
            reload('focus');
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------
// ADMIN: correct or delete one attendance record
// ---------------------------------------------------------------
function CorrectionModal({
  entry,
  adminId,
  onClose,
  onChanged,
}: {
  entry: AttendanceEntry;
  adminId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<AttendanceStatus>(entry.status);
  const [remarks, setRemarks] = useState(entry.remarks ?? '');
  const [saving, setSaving] = useState(false);

  // EVENT: "Save correction" pressed
  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateAttendance(
      entry.id,
      { status, remarks: remarks.trim() ? remarks.trim().slice(0, 200) : null },
      adminId
    );
    setSaving(false);
    if (error) showMessage('Could not save', error);
    else onChanged();
  };

  // EVENT: "Delete record" pressed
  const handleDelete = async () => {
    const ok = await confirmAction(
      'Delete attendance record?',
      `Remove ${entry.studentName}'s attendance for this event? They will be able to scan again.`,
      'Delete'
    );
    if (!ok) return;
    setSaving(true);
    const { error } = await deleteAttendance(entry.id);
    setSaving(false);
    if (error) showMessage('Could not delete', error);
    else onChanged();
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Correct attendance</Text>
          <Text style={styles.muted}>
            {entry.studentName} · scanned {formatDateTime(entry.scannedAt)}
          </Text>

          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.chips}>
            {ATTENDANCE_STATUSES.map((s) => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.chip, status === s && styles.chipActive]}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextActive]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Remarks (optional)</Text>
          <TextInput
            style={styles.input}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Reason for the correction"
            placeholderTextColor={COLORS.textSecondary}
            maxLength={200}
            editable={!saving}
          />

          <View style={styles.modalActions}>
            <AppButton theme="primary" title={saving ? 'Saving...' : 'Save'} icon="save-outline" onPress={handleSave} disabled={saving} />
            <AppButton title="Delete record" icon="trash-outline" onPress={handleDelete} disabled={saving} />
            <AppButton title="Cancel" icon="close-outline" onPress={onClose} disabled={saving} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function HistoryScreen() {
  const { profile, user } = useAuth();
  if (!profile || !user) return null;

  if (profile.role === 'student') return <StudentHistory userId={user.id} />;
  return <StaffHistory userId={user.id} isAdmin={profile.role === 'admin'} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { flex: 1, backgroundColor: COLORS.background },
  listContent: { padding: 16, gap: 12, flexGrow: 1 },
  summaryLine: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badgeRow: { flexDirection: 'row', marginTop: 6 },
  muted: { fontSize: 13, color: COLORS.textSecondary },
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
  attList: { gap: 4 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  empty: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 4 },
  attRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  attName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  remarks: { fontSize: 12, fontStyle: 'italic', color: COLORS.textMuted },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingTop: 6 },
  openLinkText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', padding: 20 },
  modal: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryMuted },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.primary },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  modalActions: { gap: 10, marginTop: 12 },
});
