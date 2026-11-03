import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Pressable,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { signUp } from '@/lib/auth';
import { cleanText, isValidEmail, validatePassword } from '@/lib/validation';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [studentNumber, setStudentNumber] = useState('');
  const [program, setProgram] = useState('');
  const [section, setSection] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);

    if (!cleanText(fullName, 100)) {
      setError('Full name is required.');
      return;
    }

    if (!email.trim() || !password || !confirmPassword) {
      setError('All fields are required.');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (role === 'student' && !cleanText(studentNumber, 30)) {
      setError('Student ID number is required.');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const { hasSession, error: authError } = await signUp(email.trim(), password, {
        full_name: cleanText(fullName, 100),
        role,
        ...(role === 'student'
          ? {
              student_number: cleanText(studentNumber, 30),
              program: cleanText(program, 100),
              section: cleanText(section, 30),
            }
          : { department: cleanText(department, 100) }),
      });

      if (authError) {
        setError(authError.message);
      } else if (hasSession) {
        router.replace('/(tabs)');
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerContainer}>
              <Header title="QR Attendance" />
            </View>

            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              Register to start recording attendance
            </Text>

            {success ? (
              <View style={styles.successContainer}>
                <Text style={styles.successTitle}>Check your email!</Text>
                <Text style={styles.successText}>
                  We sent a confirmation link to {email}. Click the link to
                  verify your account, then come back and sign in.
                </Text>
                <Link href="/login" style={styles.link}>
                  Back to Sign In
                </Link>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Juan Dela Cruz"
                  placeholderTextColor={COLORS.textSecondary}
                  editable={!loading}
                />

                <Text style={styles.label}>I am a...</Text>
                <View style={styles.roleRow}>
                  <Pressable
                    style={[
                      styles.roleChip,
                      role === 'student' && styles.roleChipActive,
                    ]}
                    onPress={() => setRole('student')}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        role === 'student' && styles.roleChipTextActive,
                      ]}
                    >
                      Student
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.roleChip,
                      role === 'teacher' && styles.roleChipActive,
                    ]}
                    onPress={() => setRole('teacher')}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        role === 'teacher' && styles.roleChipTextActive,
                      ]}
                    >
                      Teacher
                    </Text>
                  </Pressable>
                </View>

                {role === 'student' ? (
                  <>
                    <Text style={styles.label}>Student ID Number</Text>
                    <TextInput
                      style={styles.input}
                      value={studentNumber}
                      onChangeText={setStudentNumber}
                      placeholder="2026-00001"
                      placeholderTextColor={COLORS.textSecondary}
                      autoCapitalize="characters"
                      editable={!loading}
                    />
                    <Text style={styles.label}>Program / Course</Text>
                    <TextInput
                      style={styles.input}
                      value={program}
                      onChangeText={setProgram}
                      placeholder="BS Information Technology"
                      placeholderTextColor={COLORS.textSecondary}
                      editable={!loading}
                    />
                    <Text style={styles.label}>Year & Section</Text>
                    <TextInput
                      style={styles.input}
                      value={section}
                      onChangeText={setSection}
                      placeholder="3-A"
                      placeholderTextColor={COLORS.textSecondary}
                      editable={!loading}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>Department</Text>
                    <TextInput
                      style={styles.input}
                      value={department}
                      onChangeText={setDepartment}
                      placeholder="College of Computing"
                      placeholderTextColor={COLORS.textSecondary}
                      editable={!loading}
                    />
                  </>
                )}

                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your.email@school.edu"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />

                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="8+ characters, letters and numbers"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry
                  editable={!loading}
                />

                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry
                  editable={!loading}
                />

                {error && <Text style={styles.error}>{error}</Text>}

                {loading ? (
                  <ActivityIndicator
                    size="large"
                    color={COLORS.primary}
                    style={styles.loader}
                  />
                ) : (
                  <AppButton
                    theme="primary"
                    title="Sign Up"
                    icon="person-add-outline"
                    onPress={handleRegister}
                  />
                )}
              </View>
            )}

            {!success && (
              <Link href="/login" style={styles.link}>
                Already have an account? Sign In
              </Link>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.textSecondary,
    marginBottom: 32,
  },
  form: {
    marginBottom: 24,
    gap: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
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
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleChip: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  roleChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '14',
  },
  roleChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  roleChipTextActive: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  error: {
    fontSize: 14,
    color: COLORS.danger,
    marginTop: 12,
    marginBottom: 4,
  },
  loader: {
    marginVertical: 16,
  },
  link: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
});
