import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import AppButton from '@/components/AppButton';
import DateTimeField from '@/components/DateTimeField';
import { EmptyView, ErrorView } from '@/components/StateViews';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { createEvent, getEventById, updateEvent, type CloudEvent } from '@/lib/events';
import { validateEventInput } from '@/lib/validation';

export default function EventFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const { profile, user } = useAuth();

  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(() => new Date());
  const [end, setEnd] = useState(() => new Date(Date.now() + 60 * 60 * 1000));

  const [loadingEvent, setLoadingEvent] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existing, setExisting] = useState<CloudEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Edit mode: load the event once
  useEffect(() => {
    if (!id) return;
    let active = true;
    getEventById(id).then(({ event, error }) => {
      if (!active) return;
      if (error || !event) {
        setLoadError(error ?? 'Event not found.');
      } else {
        setExisting(event);
        setTitle(event.title);
        setVenue(event.venue ?? '');
        setDescription(event.description ?? '');
        if (event.start_time) setStart(new Date(event.start_time));
        if (event.end_time) setEnd(new Date(event.end_time));
      }
      setLoadingEvent(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  const isStaff = profile?.role === 'teacher' || profile?.role === 'admin';
  const canEdit =
    !isEdit || profile?.role === 'admin' || (!!existing && existing.created_by === user?.id);

  if (!isStaff) {
    return <EmptyView icon="lock-closed-outline" title="Staff only" message="Only teachers and administrators can manage events." />;
  }
  if (loadingEvent) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }
  if (loadError) return <ErrorView message={loadError} />;
  if (!canEdit) {
    return <EmptyView icon="lock-closed-outline" title="Not allowed" message="You can only edit events that you created." />;
  }

  const quickDuration = (minutes: number) =>
    setEnd(new Date(start.getTime() + minutes * 60 * 1000));

  // EVENT: "Save" pressed -> validate -> insert/update -> navigate
  const handleSave = async () => {
    setMessage(null);
    if (!user) return;

    const problem = validateEventInput(
      { title, venue, description, start, end },
      { requireFutureEnd: !isEdit }
    );
    if (problem) {
      setMessage(problem);
      return;
    }

    setSaving(true);
    const fields = { title, venue, description, start, end };

    if (isEdit && id) {
      const { error } = await updateEvent(id, fields);
      setSaving(false);
      if (error) setMessage(error);
      else router.back();
      return;
    }

    const { event, error } = await createEvent(fields, user.id);
    setSaving(false);
    if (error || !event) {
      setMessage(error ?? 'Could not create the event.');
      return;
    }
    router.replace({ pathname: '/event/[id]', params: { id: event.id } });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: isEdit ? 'Edit Event' : 'Create Event' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Event Name *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Founders Day Assembly"
          placeholderTextColor={COLORS.textSecondary}
          maxLength={120}
          editable={!saving}
        />

        <Text style={styles.label}>Venue *</Text>
        <TextInput
          style={styles.input}
          value={venue}
          onChangeText={setVenue}
          placeholder="School Gymnasium"
          placeholderTextColor={COLORS.textSecondary}
          maxLength={120}
          editable={!saving}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="What is this event about?"
          placeholderTextColor={COLORS.textSecondary}
          multiline
          maxLength={500}
          editable={!saving}
        />
        <Text style={styles.counter}>{description.length}/500</Text>

        <DateTimeField label="Start (date & time) *" value={start} onChange={setStart} />
        <DateTimeField label="End (date & time) *" value={end} onChange={setEnd} />

        <View style={styles.chips}>
          {[30, 60, 120].map((m) => (
            <Pressable key={m} style={styles.chip} onPress={() => quickDuration(m)}>
              <Text style={styles.chipText}>{m === 30 ? '+30 min' : `+${m / 60} hour${m > 60 ? 's' : ''}`}</Text>
            </Pressable>
          ))}
        </View>

        {isEdit && existing ? (
          <Text style={styles.codeNote}>Event code (cannot be changed): {existing.event_code}</Text>
        ) : (
          <Text style={styles.codeNote}>The event code and QR code are generated automatically.</Text>
        )}

        {message ? <Text style={styles.error}>{message}</Text> : null}

        <AppButton
          theme="primary"
          title={saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Event'}
          icon={isEdit ? 'save-outline' : 'add-outline'}
          onPress={handleSave}
          disabled={saving}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, gap: 4, paddingBottom: 40 },
  centered: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  counter: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right' },
  chips: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  chip: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  codeNote: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 },
  error: { fontSize: 14, color: COLORS.danger, marginVertical: 8 },
});
