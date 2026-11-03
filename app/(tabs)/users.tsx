import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import AppButton from '@/components/AppButton';
import { EmptyView, ErrorView, LoadingView } from '@/components/StateViews';
import StatusBadge, { RoleBadge } from '@/components/StatusBadge';
import { COLORS } from '@/constants/colors';
import { listUsers, updateUser } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import type { Profile, Role } from '@/lib/profiles';
import { confirmAction, showMessage } from '@/lib/ui';
import { useLoader } from '@/lib/useLoader';

type RoleFilter = 'all' | Role;
const FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'student', label: 'Students' },
  { key: 'teacher', label: 'Teachers' },
  { key: 'admin', label: 'Admins' },
];
const ROLES: Role[] = ['student', 'teacher', 'admin'];

function subtitle(p: Profile) {
  if (p.role === 'student') {
    return [p.student_number, p.program, p.section].filter(Boolean).join(' · ');
  }
  return p.department ?? '';
}

export default function UsersScreen() {
  const { profile, user } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [editing, setEditing] = useState<Profile | null>(null);

  const { data, error, loading, refreshing, refresh, retry, reload } = useLoader<Profile[]>(
    () => listUsers(),
    []
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((p) => {
      if (filter !== 'all' && p.role !== filter) return false;
      if (!q) return true;
      return (
        (p.full_name ?? '').toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.student_number ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, query, filter]);

  if (profile && profile.role !== 'admin') {
    return (
      <EmptyView
        icon="lock-closed-outline"
        title="Administrators only"
        message="You do not have access to user management."
      />
    );
  }
  if (loading) return <LoadingView label="Loading users..." />;
  if (error && data.length === 0) return <ErrorView message={error} onRetry={retry} />;

  return (
    <>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={visible}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, email or student ID"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="none"
            />
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
        }
        ListEmptyComponent={
          <EmptyView icon="people-outline" title="No users found" message="Try a different search or filter." />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setEditing(item)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.flex}>
              <Text style={styles.name}>{item.full_name || item.email.split('@')[0]}</Text>
              <Text style={styles.muted}>{item.email}</Text>
              {subtitle(item) ? <Text style={styles.muted}>{subtitle(item)}</Text> : null}
            </View>
            <View style={styles.badges}>
              <RoleBadge role={item.role} />
              {!item.is_active ? <StatusBadge label="Deactivated" tone="danger" /> : null}
            </View>
          </Pressable>
        )}
      />

      {editing && (
        <UserModal
          target={editing}
          isSelf={editing.id === user?.id}
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

function UserModal({
  target,
  isSelf,
  onClose,
  onChanged,
}: {
  target: Profile;
  isSelf: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [role, setRole] = useState<Role>(target.role);
  const [active, setActive] = useState(target.is_active);
  const [saving, setSaving] = useState(false);

  const changed = role !== target.role || active !== target.is_active;

  // EVENT: "Save changes" pressed -> UPDATE profiles (RLS: admin only)
  const handleSave = async () => {
    if (role === 'admin' && target.role !== 'admin') {
      const ok = await confirmAction(
        'Make administrator?',
        `${target.full_name || target.email} will get full access to all users, events and attendance.`,
        'Make admin'
      );
      if (!ok) return;
    }
    if (!active && target.is_active) {
      const ok = await confirmAction(
        'Deactivate account?',
        'This user will be signed out and will not be able to sign in again until reactivated.',
        'Deactivate'
      );
      if (!ok) return;
    }

    setSaving(true);
    const { error } = await updateUser(target.id, { role, is_active: active });
    setSaving(false);
    if (error) showMessage('Could not save', error);
    else onChanged();
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{target.full_name || target.email}</Text>
          <Text style={styles.muted}>{target.email}</Text>

          {isSelf ? (
            <Text style={styles.note}>
              You cannot change your own role or status. Ask another administrator.
            </Text>
          ) : null}

          <Text style={styles.fieldLabel}>Role</Text>
          <View style={styles.chips}>
            {ROLES.map((r) => (
              <Pressable
                key={r}
                disabled={isSelf}
                onPress={() => setRole(r)}
                style={[styles.chip, role === r && styles.chipActive, isSelf && styles.disabled]}
              >
                <Text style={[styles.chipText, role === r && styles.chipTextActive]}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.fieldLabel}>Account active</Text>
              <Text style={styles.muted}>Deactivated users cannot sign in.</Text>
            </View>
            <Switch
              value={active}
              onValueChange={setActive}
              disabled={isSelf}
              trackColor={{ true: COLORS.primary, false: COLORS.border }}
            />
          </View>

          <View style={styles.modalActions}>
            <AppButton
              theme="primary"
              title={saving ? 'Saving...' : 'Save changes'}
              icon="save-outline"
              onPress={handleSave}
              disabled={saving || isSelf || !changed}
            />
            <AppButton title="Close" icon="close-outline" onPress={onClose} disabled={saving} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { flex: 1, backgroundColor: COLORS.background },
  listContent: { padding: 16, gap: 10, flexGrow: 1 },
  header: { gap: 12, marginBottom: 4 },
  search: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  disabled: { opacity: 0.5 },
  inlineError: { color: COLORS.danger, fontSize: 13 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  pressed: { opacity: 0.85 },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  muted: { fontSize: 12, color: COLORS.textSecondary },
  badges: { alignItems: 'flex-end', gap: 6 },
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
  note: { fontSize: 13, color: COLORS.warning, marginTop: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, marginTop: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  modalActions: { gap: 10, marginTop: 14 },
});
