import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS } from '@/constants/colors';

type Props = {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
};

const pad = (n: number) => String(n).padStart(2, '0');
const toWebText = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

function parseWebText(text: string): Date | null {
  const m = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function DateTimeField({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState<'date' | 'time'>('date');
  const [webText, setWebText] = useState(toWebText(value));

  useEffect(() => {
    setWebText(toWebText(value));
  }, [value]);

  // Web has no native picker -> plain text field "YYYY-MM-DD HH:mm"
  if (Platform.OS === 'web') {
    return (
      <View>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={styles.input}
          value={webText}
          onChangeText={(text) => {
            setWebText(text);
            const parsed = parseWebText(text);
            if (parsed) onChange(parsed);
          }}
          placeholder="YYYY-MM-DD HH:mm"
          placeholderTextColor={COLORS.textSecondary}
        />
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={styles.input}
        onPress={() => {
          setPart('date');
          setOpen(true);
        }}
      >
        <Text style={styles.inputText}>{value.toLocaleString()}</Text>
      </Pressable>

      {open && (
        <DateTimePicker
          value={value}
          mode={part}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          themeVariant="dark"
          onChange={(event, selected) => {
            if (Platform.OS === 'android') {
              if (event.type === 'dismissed' || !selected) {
                setOpen(false);
                return;
              }
              const next = new Date(value);
              if (part === 'date') {
                next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                onChange(next);
                setPart('time'); // second step: pick the time
              } else {
                next.setHours(selected.getHours(), selected.getMinutes());
                onChange(next);
                setOpen(false);
                setPart('date');
              }
            } else if (selected) {
              onChange(selected);
            }
          }}
        />
      )}

      {Platform.OS === 'ios' && open && (
        <View style={styles.iosRow}>
          <Pressable
            style={styles.iosBtn}
            onPress={() => setPart(part === 'date' ? 'time' : 'date')}
          >
            <Text style={styles.iosBtnText}>{part === 'date' ? 'Set time' : 'Set date'}</Text>
          </Pressable>
          <Pressable style={styles.iosBtn} onPress={() => setOpen(false)}>
            <Text style={styles.iosBtnText}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 10,
    marginBottom: 6,
  },
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
  inputText: { fontSize: 16, color: COLORS.textPrimary },
  iosRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  iosBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iosBtnText: { color: COLORS.primary, fontWeight: '700' },
});
