# Phase 2 — Authentication

> Replace hardcoded student identity with Supabase Authentication.
> Users can register, log in, and log out.

---

## 1. MODULE OBJECTIVE

**What are we building?**

We are replacing the hardcoded `STUDENT-2026-001` with real Supabase Authentication. After this phase, users must register an account and log in before using the app. Each user gets a unique identity.

**Why do we need it?**

Currently, every user is the same person. There is no way to distinguish between students. If the app is reinstalled, the identity is lost. Authentication solves this.

**What will the student learn?**

- What authentication is (sign up, sign in, sign out)
- What a session is (staying logged in)
- How to create auth-protected screens
- How to get the current logged-in user
- How explicit navigation works with expo-router

---

## 2. CURRENT STATE

```
App starts
    |
    v
No login screen
    |
    v
Hardcoded: STUDENT_ID = 'STUDENT-2026-001'
    |
    v
All screens use this ID
```

---

## 3. TARGET STATE

```
App starts
    |
    v
Login Screen (default)
    |
    +--- Register --> Account created --> Login Screen
    |
    +--- Login (email + password) --> Tabs (Scan, History, Profile)
                                        |
                                        +--- Profile --> Sign Out --> Login Screen
```

---

## 4. FILES INVOLVED

| File | Action | Why |
|---|---|---|
| `lib/auth.ts` | Created | Authentication state + service (pub/sub pattern) |
| `app/login.tsx` | Created | Login screen with email/password form |
| `app/register.tsx` | Created | Registration screen with email/password/confirm |
| `app/_layout.tsx` | Modified | Stack with auth-based `<Redirect>` + loading state (see `docs/07-visual-identity.md`) |
| `app/(tabs)/profile.tsx` | Modified | Shows user info + Sign Out button |
| `app/(tabs)/scan.tsx` | Modified | Use authenticated user instead of hardcoded ID |
| `app/(tabs)/history.tsx` | Modified | Use authenticated user instead of hardcoded ID |
| `constants/student.ts` | Unchanged | Will be deprecated later |

---

## 5. CONCEPT EXPLANATIONS

### What is Authentication?

Authentication answers: **"Who are you?"**

- Sign Up: Create a new account
- Sign In: Log into existing account
- Sign Out: End the session

### Why Not Use onAuthStateChange?

Supabase's `onAuthStateChange` and `getSession()` are designed for web environments. In React Native with Expo Go, these APIs can hang indefinitely due to:
- Stale tokens in storage triggering failed refresh attempts
- AsyncStorage adapter compatibility issues
- Network timeout behavior differences on mobile

**Our solution:** A global state store with a pub/sub pattern. Auth operations (`signIn`, `signUp`, `signOut`) directly update the global state and notify all listeners. Navigation is handled explicitly with `router.replace()`.

### Why Explicit Navigation Instead of Conditional Rendering?

expo-router manages its own navigation state. When a root layout conditionally renders different `<Stack>` elements based on auth state, expo-router cannot properly unmount/remount screens.

**Our solution:** All screens are always registered in a single `<Stack>`. After login, the screen calls `router.replace('/(tabs)')` to navigate. After sign out, it calls `router.replace('/login')`.

---

## 6. BEFORE/AFTER COMPARISON

### Student Identity

```diff
- import { STUDENT_ID } from '@/constants/student';
- registerAttendance(data, STUDENT_ID)
+ import { useAuth } from '@/lib/auth';
+ const { user } = useAuth();
+ const studentId = user?.id ?? 'unknown';
+ registerAttendance(data, studentId)
```

### Auth State Management

```diff
- // Before: No auth state, no login screen
+ // After: Global state with pub/sub
+ let globalSession: Session | null = null;
+ let listeners: Set<() => void> = new Set();
+
+ export function setAuth(session: Session | null) {
+   globalSession = session;
+   globalUser = session?.user ?? null;
+   globalLoading = false;
+   notify();
+ }
```

### Navigation

```diff
- // Before: Conditional Stack rendering (doesn't work with expo-router)
+ // After: Single Stack, explicit navigation
+ // login.tsx: router.replace('/(tabs)') after sign in
+ // profile.tsx: router.replace('/login') after sign out
```

### Sign Out

```diff
- // Before: Wait for Supabase server (hangs on mobile)
+ // After: Update state immediately, fire server call in background
+ export async function signOut() {
+   setAuth(null);
+   supabase.auth.signOut().catch(() => {});
+   return { error: null };
+ }
```

---

## 7. LINE-BY-LINE EXPLANATION

### lib/supabase.ts

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```
- `createClient` — Creates the Supabase client singleton
- `process.env.EXPO_PUBLIC_*` — Expo environment variables (loaded from `.env`)
- `autoRefreshToken: true` — Supabase auto-refreshes expired tokens
- `persistSession: true` — Session is stored on device
- `detectSessionInUrl: false` — Not needed for React Native (no URL bar)

**Note:** We do NOT use a custom storage adapter (SecureStore or AsyncStorage). The default storage works on both iOS and Android. Custom adapters caused the session to hang during `getSession()`.

### lib/auth.ts

```typescript
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';
```
- `useState`, `useEffect` — React hooks for subscribing to changes
- `supabase` — The client from Phase 1
- `Session`, `User` — TypeScript types from Supabase

```typescript
type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};
```
- Defines the shape of our auth state
- `session` — Contains access token, user info (null if not logged in)
- `user` — The logged-in user object (null if not logged in)
- `loading` — True while checking if session exists

```typescript
let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = false;
let listeners: Set<() => void> = new Set();
```
- **Module-level variables** — Shared across all components that call `useAuth()`
- `globalSession` — Current session (null = not logged in)
- `globalUser` — Current user (null = not logged in)
- `globalLoading` — Starts `false` (no async check needed)
- `listeners` — Set of callback functions to notify when state changes

```typescript
function notify() {
  listeners.forEach((l) => l());
}
```
- Calls every registered listener when state changes

```typescript
export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  notify();
}
```
- **The core function** — Updates global state and notifies all listeners
- Called by `signIn`, `signUp`, and `signOut`

```typescript
export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return {
    session: globalSession,
    user: globalUser,
    loading: globalLoading,
  };
}
```
- Custom React hook — Any component can call `useAuth()` to get current auth state
- Uses `forceRender` to trigger re-render when global state changes
- Cleans up listener when component unmounts
- Returns current global state (not React state — reads directly from module variables)

```typescript
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}
```
- Creates a new user account via Supabase
- If successful and a session is returned, updates global state
- Returns data/error for the caller to handle

```typescript
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}
```
- Logs in an existing user
- If successful, updates global state
- Returns data/error for the caller to handle

```typescript
export async function signOut() {
  setAuth(null);
  supabase.auth.signOut().catch(() => {});
  return { error: null };
}
```
- **Key design choice:** Updates state immediately (sets session to null)
- Fires Supabase `signOut()` in the background (fire-and-forget)
- This avoids the hang that occurs when waiting for the server response on mobile
- The caller navigates to login immediately after this returns

### app/_layout.tsx

> **Note:** This layout now includes an **auth-based redirect**. The current version is documented in `docs/07-visual-identity.md`. This section keeps the code that was accurate at the end of Phase 2; see the visual-identity doc for the updated file.

```typescript
import { Stack } from 'expo-router';
import { COLORS } from '@/constants/colors';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
```
- **Original Phase 2 layout** — All screens are always registered within a single `<Stack>`
- Navigation is handled per-screen after auth operations (e.g. `router.replace` in login/register)
- `headerShown: false` — All screens manage their own headers
- A later design pass added auth-based `<Redirect>` routing on top of this single Stack (see `docs/07-visual-identity.md`)

### app/login.tsx

```typescript
const router = useRouter();

const handleLogin = async () => {
  setError(null);
  setLoading(true);
  try {
    const { data, error: authError } = await signIn(email.trim(), password);
    if (authError) {
      setError(authError.message);
    } else {
      router.replace('/(tabs)');
    }
  } catch (err: any) {
    setError(err?.message || 'Unexpected error');
  } finally {
    setLoading(false);
  }
};
```
- `useRouter()` — Gives access to expo-router navigation
- After successful `signIn`, calls `router.replace('/(tabs)')` to navigate to the main app
- On error, shows the error message on the login form
- `router.replace()` replaces the current screen (user can't press Back to go to login)

### app/(tabs)/profile.tsx

```typescript
const router = useRouter();

const handleSignOut = async () => {
  setLoading(true);
  try {
    await signOut();
    router.replace('/login');
  } catch (err: any) {
    Alert.alert('Error', err?.message || 'Failed to sign out.');
  } finally {
    setLoading(false);
  }
};
```
- After `signOut()`, immediately navigates to login screen
- Shows user email and User ID on the profile card
- Sign Out button is disabled while the operation is in progress

---

## 8. TESTING

### How to Test This Module

1. **Start Expo:**
   ```bash
   npx expo start -c
   ```

2. **Verify login screen appears:**
   - You should see "Welcome Back" screen with email/password fields
   - NOT the Home screen (you are not logged in)

3. **Test Registration:**
   - Tap "Don't have an account? Sign Up"
   - Enter email and password
   - Tap "Sign Up"
   - You should see "Check your email!" message (if email confirmation is ON)
   - OR you may be logged in directly (if email confirmation is OFF)

4. **Test Login:**
   - Go back to the login screen
   - Enter your email and password
   - Tap "Sign In"
   - You should see the Scan tab

5. **Test Sign Out:**
   - Go to Profile tab
   - Tap "Sign Out"
   - You should be redirected to the login screen

6. **Test Login Error:**
   - Enter wrong email or password
   - Tap "Sign In"
   - You should see an error message

---

## 9. EXPECTED RESULT

- Login screen appears when app starts (default screen)
- Registration creates account in Supabase
- Login with correct credentials navigates to tabs
- Login with wrong credentials shows error message
- Sign Out navigates back to login screen
- Profile shows user email and User ID
- Scan screen uses authenticated user ID (not hardcoded)
- History screen uses authenticated user ID (not hardcoded)

---

## 10. COMMON ERRORS

### Error: "Invalid login credentials"

**Cause:** Wrong email or password.

**Fix:** Verify email and password are correct. Check for typos. Check Supabase Dashboard > Authentication > Users to verify the account exists.

### Error: "Email not confirmed"

**Cause:** User has not confirmed their email (email confirmation is ON in Supabase).

**Fix:** Either confirm the email, or disable email confirmation:
1. Go to Supabase Dashboard
2. Authentication > Providers > Email
3. Toggle "Confirm email" OFF
4. Click Save Changes

### Error: "User already registered"

**Cause:** Email is already in use.

**Fix:** Use a different email, or try to log in with the existing account.

### Error: App stuck on loading spinner

**Cause:** `getSession()` or `onAuthStateChange` is hanging.

**Fix:** This is the known issue this implementation works around. If you see this, ensure you are using the pub/sub pattern in `lib/auth.ts` (not `getSession()` or `onAuthStateChange`).

### Error: Login succeeds but stays on login screen

**Cause:** Navigation not triggered after login.

**Fix:** Ensure `app/login.tsx` calls `router.replace('/(tabs)')` after successful `signIn()`.

### Error: Sign out doesn't navigate

**Cause:** Navigation not triggered after sign out.

**Fix:** Ensure `app/(tabs)/profile.tsx` calls `router.replace('/login')` after `signOut()`.

---

## 11. SECURITY NOTES

### What is Safe

- Email + password authentication via Supabase is secure
- Passwords are hashed (never stored in plain text)
- Supabase handles token management and refresh

### What to Watch For

- Never log passwords in console
- Never store passwords in your own database
- Always use HTTPS (Supabase enforces this)
- Email confirmation prevents fake accounts (disable only in dev)

### Email Confirmation

By default, Supabase may require email confirmation. For development:
1. Go to Supabase Dashboard > Authentication > Providers > Email
2. Toggle "Confirm email" OFF
3. Click Save Changes

---

## 12. STEP-BY-STEP EXECUTION GUIDE

### Prerequisites

- Phase 1 completed (Supabase client installed, `.env` configured)
- Supabase project created with real credentials in `.env`
- Expo development server can start

---

### Step 1: Update Supabase Client

Open `lib/supabase.ts` and replace ALL content with:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

Save the file.

---

### Step 2: Create Authentication Service

Create a new file: `lib/auth.ts`

Paste the following content exactly:

```typescript
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = false;
let listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((l) => l());
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  notify();
}

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return {
    session: globalSession,
    user: globalUser,
    loading: globalLoading,
  };
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function signOut() {
  setAuth(null);
  supabase.auth.signOut().catch(() => {});
  return { error: null };
}
```

Save the file.

---

### Step 3: Create Login Screen

Create a new file: `app/login.tsx`

Paste the following content exactly:

```tsx
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
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { signIn } from '@/lib/auth';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await signIn(email.trim(), password);

      if (authError) {
        setError(authError.message);
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected error');
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

            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to record your attendance</Text>

            <View style={styles.form}>
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
                placeholder="Enter your password"
                placeholderTextColor={COLORS.textSecondary}
                secureTextEntry
                editable={!loading}
              />

              {error && <Text style={styles.error}>{error}</Text>}

              {loading ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
              ) : (
                <AppButton
                  theme="primary"
                  title="Sign In"
                  icon="log-in-outline"
                  onPress={handleLogin}
                />
              )}
            </View>

            <Link href="/register" style={styles.link}>
              Don't have an account? Sign Up
            </Link>
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
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  form: {
    marginBottom: 24,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  error: {
    fontSize: 14,
    color: '#C62828',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  loader: {
    marginVertical: 16,
  },
  link: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
});
```

Save the file.

---

### Step 4: Create Registration Screen

Create a new file: `app/register.tsx`

Paste the following content exactly:

```tsx
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
} from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { signUp } from '@/lib/auth';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);

    if (!email.trim() || !password || !confirmPassword) {
      setError('All fields are required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await signUp(email.trim(), password);

      if (authError) {
        setError(authError.message);
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
            <Text style={styles.subtitle}>Register to start recording attendance</Text>

            {success ? (
              <View style={styles.successContainer}>
                <Text style={styles.successTitle}>Check your email!</Text>
                <Text style={styles.successText}>
                  We sent a confirmation link to {email}. Click the link to verify your
                  account, then come back and sign in.
                </Text>
                <Link href="/login" style={styles.link}>
                  Back to Sign In
                </Link>
              </View>
            ) : (
              <View style={styles.form}>
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
                  placeholder="At least 6 characters"
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
                  <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
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
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  form: {
    marginBottom: 24,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  error: {
    fontSize: 14,
    color: '#C62828',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  loader: {
    marginVertical: 16,
  },
  link: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    backgroundColor: COLORS.card,
    borderRadius: 14,
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
```

Save the file.

---

### Step 5: Update Root Layout

Open `app/_layout.tsx` and replace ALL content with:

```tsx
import { Stack } from 'expo-router';

import { COLORS } from '@/constants/colors';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
```

Save the file.

---

### Step 6: Update Profile Screen

Open `app/(tabs)/profile.tsx` and replace ALL content with:

```tsx
import { useState } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth, signOut } from '@/lib/auth';

export default function ProfileScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      router.replace('/login');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to sign out.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Profile</Text>

      {user && (
        <View style={styles.infoCard}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user.email}</Text>

          <Text style={styles.label}>User ID</Text>
          <Text style={styles.valueSmall}>{user.id}</Text>
        </View>
      )}

      <AppButton
        title="Sign Out"
        icon="log-out-outline"
        onPress={handleSignOut}
        disabled={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  value: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  valueSmall: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
});
```

Save the file.

---

### Step 7: Update Scan Screen

Open `app/(tabs)/scan.tsx` and make these changes:

**Replace the import:**
```diff
- import { STUDENT_ID } from '@/constants/student';
+ import { useAuth } from '@/lib/auth';
```

**Inside the component, add:**
```diff
  export default function ScanScreen() {
+   const { user } = useAuth();
```

**In the handleBarcodeScanned function:**
```diff
-   registerAttendance(data, STUDENT_ID).then((result) => {
+   const studentId = user?.id ?? 'unknown';
+   registerAttendance(data, studentId).then((result) => {
```

Save the file.

---

### Step 8: Update History Screen

Open `app/(tabs)/history.tsx` and make these changes:

**Replace the import:**
```diff
- import { STUDENT_ID } from '@/constants/student';
+ import { useAuth } from '@/lib/auth';
```

**Inside the component, add:**
```diff
  export default function HistoryScreen() {
+   const { user } = useAuth();
```

**In the loadHistory function:**
```diff
-   getAttendanceHistory(STUDENT_ID).then((rows) => {
+   const studentId = user?.id ?? 'unknown';
+   getAttendanceHistory(studentId).then((rows) => {
```

Save the file.

---

### Step 9: Verify TypeScript

Run:
```bash
npx tsc --noEmit
```

Expected: No output (no errors).

---

### Step 10: Test the App

Run:
```bash
npx expo start -c
```

**Test Checklist:**

| # | Test | Expected Result |
|---|---|---|
| 1 | App starts | Shows login screen (not tabs) |
| 2 | Tap "Sign Up" | Navigates to registration screen |
| 3 | Fill form, tap "Sign Up" | Account created in Supabase |
| 4 | Go back to login | Enter email + password, tap "Sign In" |
| 5 | Login success | Shows Scan tab |
| 6 | Go to Profile tab | Shows user email and ID |
| 7 | Tap "Sign Out" | Redirects to login screen |
| 8 | Login with wrong credentials | Shows error message |
| 9 | Go to Scan tab | Camera opens (no errors) |
| 10 | Go to History tab | Shows records or empty state (no errors) |

---

### Step 11: Summary Checklist

| # | Check | Status |
|---|---|---|
| 1 | `lib/supabase.ts` updated | Uses plain config (no custom storage) |
| 2 | `lib/auth.ts` created | Global state + pub/sub pattern |
| 3 | `app/login.tsx` created | Login with router.replace navigation |
| 4 | `app/register.tsx` created | Registration form |
| 5 | `app/_layout.tsx` updated | Simple Stack, all screens registered |
| 6 | `app/(tabs)/profile.tsx` updated | Sign Out with router.replace |
| 7 | `app/(tabs)/scan.tsx` updated | Uses `user.id` |
| 8 | `app/(tabs)/history.tsx` updated | Uses `user.id` |
| 9 | TypeScript compiles | `npx tsc --noEmit` shows no errors |
| 10 | Login works | Tabs appear after login |
| 11 | Sign Out works | Login screen appears after sign out |

---

## 13. KNOWN LIMITATIONS

1. **No session restore on refresh** — Users must log in again after refreshing the app. Session restore will be added in a future phase once the `getSession()` hang issue is resolved.

2. **signOut is fire-and-forget** — The Supabase server is notified asynchronously. If the device is offline, the session may persist on the server but will be cleared locally.

3. **No token refresh** — Since we don't use `onAuthStateChange`, token refresh events are not handled. Short-lived sessions may expire without the user being notified.

---

## 14. DOCUMENTATION

After completing this phase:
- Created `docs/02-authentication.md` (this document)
- Updated `docs/migration-log.md` with Phase 2 entry

---

*This phase was completed on 2026-09-03.*
*Authentication is functional: users can register, log in, and log out.*
*The hardcoded STUDENT_ID is no longer used in scan.tsx and history.tsx.*
