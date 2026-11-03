import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import AppButton from "@/components/AppButton";
import { RoleBadge } from "@/components/StatusBadge";
import { COLORS } from "@/constants/colors";
import { refreshProfile, signOut, useAuth } from "@/lib/auth";
import { updateProfile, type Profile } from "@/lib/profiles";
import { confirmAction, showMessage } from "@/lib/ui";
import { cleanText } from "@/lib/validation";

type Draft = {
  full_name: string;
  student_number: string;
  program: string;
  section: string;
  department: string;
};

const toDraft = (p: Profile): Draft => ({
  full_name: p.full_name ?? "",
  student_number: p.student_number ?? "",
  program: p.program ?? "",
  section: p.section ?? "",
  department: p.department ?? "",
});

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null); // null = not editing
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile || !user) return null;

  const editing = draft !== null;
  const set = (key: keyof Draft) => (value: string) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  // EVENT: "Save" pressed -> validate -> UPDATE profiles (own row only, RLS)
  const handleSave = async () => {
    if (!draft) return;
    setError(null);

    const name = cleanText(draft.full_name, 100);
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (profile.role === "student" && !cleanText(draft.student_number, 30)) {
      setError("Student ID number is required.");
      return;
    }

    setSaving(true);
    const updates =
      profile.role === "student"
        ? {
            full_name: name,
            student_number: cleanText(draft.student_number, 30),
            program: cleanText(draft.program, 100) || null,
            section: cleanText(draft.section, 30) || null,
          }
        : profile.role === "teacher"
          ? {
              full_name: name,
              department: cleanText(draft.department, 100) || null,
            }
          : { full_name: name };

    const { error: err } = await updateProfile(user.id, updates);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    await refreshProfile();
    setDraft(null);
  };

  // EVENT: "Sign out" pressed -> clear session -> route guard sends user to login
  const handleSignOut = async () => {
    const ok = await confirmAction(
      "Sign out?",
      "You will need to sign in again.",
      "Sign out",
    );
    if (!ok) return;
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } catch (err: any) {
      showMessage("Error", err?.message || "Failed to sign out.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <RoleBadge role={profile.role} />

        <View style={styles.infoCard}>
          <Field
            label="Name"
            value={profile.full_name}
            editing={editing}
            draft={draft?.full_name}
            onChange={set("full_name")}
            placeholder="Your full name"
          />
          <Field label="Email" value={profile.email} />

          {profile.role === "student" && (
            <>
              <Field
                label="Student ID"
                value={profile.student_number}
                editing={editing}
                draft={draft?.student_number}
                onChange={set("student_number")}
                placeholder="2026-00001"
              />
              <Field
                label="Program"
                value={profile.program}
                editing={editing}
                draft={draft?.program}
                onChange={set("program")}
                placeholder="BS Information Technology"
              />
              <Field
                label="Year & Section"
                value={profile.section}
                editing={editing}
                draft={draft?.section}
                onChange={set("section")}
                placeholder="3-A"
              />
            </>
          )}
          {profile.role === "teacher" && (
            <Field
              label="Department"
              value={profile.department}
              editing={editing}
              draft={draft?.department}
              onChange={set("department")}
              placeholder="College of Computing"
            />
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {editing ? (
          <View style={styles.actions}>
            <AppButton
              theme="primary"
              title={saving ? "Saving..." : "Save"}
              icon="save-outline"
              onPress={handleSave}
              disabled={saving}
            />
            <AppButton
              title="Cancel"
              icon="close-outline"
              onPress={() => {
                setDraft(null);
                setError(null);
              }}
              disabled={saving}
            />
          </View>
        ) : (
          <View style={styles.actions}>
            <AppButton
              title="Edit Profile"
              icon="create-outline"
              onPress={() => setDraft(toDraft(profile))}
            />
            <AppButton
              title="Sign Out"
              icon="log-out-outline"
              onPress={handleSignOut}
              disabled={signingOut}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  editing,
  draft,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  editing?: boolean;
  draft?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {editing && onChange ? (
        <TextInput
          style={styles.input}
          value={draft ?? ""}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textSecondary}
          maxLength={100}
        />
      ) : (
        <Text style={styles.value}>{value || "—"}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 16,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 10,
  },
  value: { fontSize: 15, color: COLORS.textPrimary, fontWeight: "500" },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  error: { fontSize: 14, color: COLORS.danger },
  actions: { gap: 12 },
});
