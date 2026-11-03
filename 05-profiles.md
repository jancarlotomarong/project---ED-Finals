# Phase 5 — Profiles (Names & Roles)

> This is a **student lab activity**. In Phase 4 your app could *store attendance*. But every user was still treated the same — there was **no way to be a Teacher**, and no display name. This phase adds **profiles**: a name, and a role (Student or Teacher) that you choose at signup.

---

## HOW TO USE THIS DOCUMENT (Read Me First)

In this phase you will:
1. **LEARN** — why profiles matter
2. **CODE** — a role picker at signup + a Profile screen that shows your name and role
3. **VERIFY** — typecheck + test as a Teacher and as a Student

**Time needed:** ~30 minutes
**You will need:** The `profiles` table from Phase 3 (already in your Supabase project).

---

## 1. WHAT ARE WE DOING AND WHY?

### The Problem

Right now:
- Every account is treated as a **Student** — there's **no way to sign up as a Teacher**.
- The Profile screen only shows your **email** and a random **User ID**. No name, no role.

### The Goal

By the end of this phase:
1. When you **sign up**, you can choose **"I am a Student"** or **"I am a Teacher"**.
2. Your chosen **role** and **display name** are saved to the `profiles` table (built in Phase 3).
3. The **Profile screen** shows your name, role, email, and user ID — and you can **edit your name**.

### The Analogy: A Name Tag

Think of the `profiles` table as the **name tags** at an event. Your auth account (Phase 2) is just a login — like your ID card. But your **profile** is the name tag: it says **who you are** (name) and **what you do** (Student/Teacher). A name tag won't help if you never put one on — that's exactly what we build here.

### Remember the Phase 3 Trigger

In Phase 3, we set up a **trigger** that automatically creates a `profiles` row whenever *anyone* signs up. So the profile row already exists the moment you register. But it's created with:
- `full_name` = **empty** (null)
- `role` = **`'student'`** (the default)

Today we **fill in** that empty row with what the student chose.

---

## 2. THE PLAN — THREE CODE CHANGES

| # | File | What changes |
|---|---|---|
| 1 | `lib/profiles.ts` (**new**) | Helpers to read (`getProfile`) and update (`updateProfile`) a profile |
| 2 | `lib/auth.ts` | `signUp` now accepts a name + role and saves them after signup |
| 3 | `app/register.tsx` | Adds a **Full Name** field and a **I am a...** Student/Teacher picker |
| 4 | `app/(tabs)/profile.tsx` | Loads the profile and displays name, role, email, ID (with name editing) |

---

## 3. NEW FILE: `lib/profiles.ts`

This is a small **service module** — a set of helper functions for talking to the `profiles` table. It keeps the screens clean.

```typescript
import { supabase } from './supabase';

export type Role = 'student' | 'teacher';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};
```

| Piece | Meaning |
|---|---|
| `export type Role = 'student' \| 'teacher'` | A custom type that can only be one of these two values (matches the `check` constraint from Phase 3). |
| `Profile` | The shape of one profile row, as our app sees it. |

```typescript
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Profile;
}
```

| Line | Meaning |
|---|---|
| `.from('profiles').select(...)` | Read from the `profiles` cloud table (built in Phase 3). |
| `.eq('id', userId)` | Fetch only the profile whose `id` matches this user. |
| `.maybeSingle()` | Expect 0 or 1 rows (won't error if the profile is missing). |
| `if (error || !data) return null` | If something went wrong or no profile found, return `null` so the screen can handle it gracefully. |
| `return data as Profile` | Return the row typed as a `Profile`. |
| **RLS** | The Phase 3 policy "Profiles are viewable by owner" lets the user read only THEIR OWN row. |

```typescript
export async function updateProfile(
  userId: string,
  updates: { full_name?: string; role?: Role }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  return { error: error?.message ?? null };
}
```

| Line | Meaning |
|---|---|
| `updates` | An object holding whatever we want to change (name and/or role). |
| `.update(updates).eq('id', userId)` | Update that user's row with the new values. |
| `return { error: ... }` | Return a small object the screen can check (like our other functions). |
| **RLS** | The policy "Users can update their own profile" permits this only for your own row. |

---

## 4. CHANGE `lib/auth.ts` — SAVE THE ROLE & NAME ON SIGNUP

Here's the updated `signUp` function:

```typescript
export type SignUpProfile = {
  full_name: string;
  role: 'student' | 'teacher';
};

export async function signUp(
  email: string,
  password: string,
  profile?: SignUpProfile
) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (!error && data.session && profile) {
    // The Phase 3 trigger creates the profile row on signup.
    // Fill in the full_name and role the student chose.
    await supabase
      .from('profiles')
      .update({ full_name: profile.full_name, role: profile.role })
      .eq('id', data.session.user.id);
  }
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}
```

**Walk through it:**

| Step | What happens |
|---|---|
| `supabase.auth.signUp({ email, password })` | Creates the **auth user**. At the same moment, the **Phase 3 trigger** fires and creates a `profiles` row (`id` + `email`, empty name, default role). |
| `if (!error && data.session && profile)` | If signup worked, we have a session, and a profile was passed in... |
| `.update({ full_name, role }).eq('id', data.session.user.id)` | ...we update the just-created profile row with the student's **chosen name and role**. |
| `setAuth(data.session)` | Store the session in our global auth state (from Phase 2). |

> 💡 **Why update, not insert?** Because the Phase 3 **trigger already INSERTED** the profile row. So we don't create a second one — we **UPDATE** the existing row with the missing name/role. (Inserting again would violate the primary key.)

> ⚠️ **Note about email confirmation:** This relies on `data.session` being present right after signup. In your project, **email confirmation is turned off**, so signup returns a session immediately. If email confirmation were ON, there'd be no session yet — the student would confirm their email first, and we'd need a different approach.

---

## 5. CHANGE `app/register.tsx` — THE ROLE PICKER

We add two things to the Sign Up form: a **Full Name** box and a **"I am a..."** selector.

### 5a. New state

```typescript
const [fullName, setFullName] = useState('');
const [role, setRole] = useState<'student' | 'teacher'>('student');
```

| State | Meaning |
|---|---|
| `fullName` | What the student types as their display name. |
| `role` | `'student'` by default; becomes `'teacher'` if they tap Teacher. |

### 5b. Pass the extra data to `signUp`

In the submit handler, we now call:

```typescript
const { data, error: authError } = await signUp(
  email.trim(),
  password,
  { full_name: fullName.trim(), role }
);
```

And handle the result:

```typescript
if (authError) {
  setError(authError.message);
} else if (data.session) {
  // Email confirmation is disabled, so a session exists right away.
  router.replace('/(tabs)');
} else {
  // Email confirmation is on — show the "check your email" message.
  setSuccess(true);
}
```

| Branch | Meaning |
|---|---|
| `authError` | Show the error. |
| `data.session` | Confirmation is OFF → the student is logged in → go straight to the app **tabs**. |
| else | Confirmation is ON → show "Check your email". |

> **Why `router.replace('/(tabs)')`?** Remember Phase 2 — we navigate with `router.replace()` (not conditional rendering) because `getSession()`/`onAuthStateChange` don't work reliably in Expo Go.

### 5c. The role selector UI

```jsx
<Text style={styles.label}>I am a...</Text>
<View style={styles.roleRow}>
  <Pressable
    style={[styles.roleChip, role === 'student' && styles.roleChipActive]}
    onPress={() => setRole('student')}
  >
    <Text style={[styles.roleChipText, role === 'student' && styles.roleChipTextActive]}>
      Student
    </Text>
  </Pressable>
  <Pressable
    style={[styles.roleChip, role === 'teacher' && styles.roleChipActive]}
    onPress={() => setRole('teacher')}
  >
    <Text style={[styles.roleChipText, role === 'teacher' && styles.roleChipTextActive]}>
      Teacher
    </Text>
  </Pressable>
</View>
```

- Two tappable **chips**. The selected one gets the `Active` style (highlighted border/color).
- `role === 'student' && styles.roleChipActive` → apply the highlight **only when** that role is selected.

---

## 6. CHANGE `app/(tabs)/profile.tsx` — SHOW YOUR PROFILE

### 6a. Load the profile when the screen appears

```typescript
const loadProfile = useCallback(async () => {
  if (!user) return;
  const p = await getProfile(user.id);
  setProfile(p);
  setDraftName(p?.full_name ?? '');
}, [user]);

useFocusEffect(
  useCallback(() => {
    loadProfile();
  }, [loadProfile])
);
```

- `useFocusEffect` runs the callback **every time** the Profile tab is shown (so it refreshes after you edit/sign in). This matches the same pattern used by the History screen.
- We load the profile and store it in state, and pre-fill the draft name so the edit box starts populated.

### 6b. Show the role as a badge

```jsx
{profile?.role === 'teacher' ? (
  <View style={styles.roleBadge}>
    <Text style={styles.roleBadgeText}>Teacher</Text>
  </View>
) : (
  <View style={[styles.roleBadge, styles.roleBadgeStudent]}>
    <Text style={styles.roleBadgeText}>Student</Text>
  </View>
)}
```

- A small colored pill at the top that says **Teacher** or **Student**.
- Uses a slightly different background color depending on role so it's easy to tell at a glance.

### 6c. Show & edit the name

```jsx
{editing ? (
  <View style={styles.nameEditRow}>
    <TextInput value={draftName} onChangeText={setDraftName} ... />
    <Pressable onPress={handleSaveName} ...>Save</Pressable>
  </View>
) : (
  <Pressable onPress={() => setEditing(true)} style={styles.nameRow}>
    <Text style={styles.value}>
      {profile?.full_name || 'Tap to add your name'}
    </Text>
    <Text style={styles.editHint}>Edit</Text>
  </Pressable>
)}
```

- **Not editing:** shows the name (or "Tap to add your name" if empty) with an **Edit** hint. Tap it to switch to editing mode.
- **Editing:** shows a text box + **Save** button.

### 6d. Save the name

```typescript
const handleSaveName = async () => {
  if (!user) return;
  setSaving(true);
  const { error } = await updateProfile(user.id, { full_name: draftName.trim() });
  setSaving(false);
  if (error) {
    Alert.alert('Error', error);
  } else {
    setProfile((prev) => (prev ? { ...prev, full_name: draftName.trim() } : prev));
    setEditing(false);
  }
};
```

- Calls `updateProfile` from `lib/profiles.ts`.
- On success, updates local state and exits editing mode. On error, shows an alert.

---

## 7. BEFORE vs AFTER — SIDE BY SIDE

| Aspect | BEFORE (Phase 4) | AFTER (Phase 5) |
|---|---|---|
| Sign up | email + password only | + Full Name + Student/Teacher picker |
| Role | always `'student'` | stored from the picker (`student`/`teacher`) |
| Profile screen | email + user ID only | + name, + role badge, editable name |
| Set name/role | impossible | `lib/profiles.ts` get/update helpers |
| After signup | "check your email" only | goes to tabs if a session exists |

---

## 7.5. STEP-BY-STEP EXECUTION GUIDE (what to type, in order)

> This turns Sections 3–6 into a "do it now" checklist. Edit the files in this order.

### Step 1 — Create `lib/profiles.ts` (NEW file, Section 3)
Create `lib/profiles.ts` with:
- `export type Role = 'student' | 'teacher';`
- `export type Profile = { id; email; full_name | null; role };`
- `export async function getProfile(userId)` — `.from('profiles').select('id, email, full_name, role').eq('id', userId).maybeSingle()`
- `export async function updateProfile(userId, updates)` — `.from('profiles').update(updates).eq('id', userId)`

### Step 2 — Edit `lib/auth.ts` (Section 4)
- Add `export type SignUpProfile = { full_name; role }`.
- In `signUp(...)`, after a successful signup **and** if `data.session` exists and `profile` was passed, run:
  ```typescript
  await supabase.from('profiles').update({ full_name, role }).eq('id', data.session.user.id);
  ```
- If a session exists, call `setAuth(data.session)` and return.

### Step 3 — Edit `app/register.tsx` (Section 5)
- Add a **Full Name** text input.
- Add a **Student / Teacher picker** setting `role` state.
- Pass `{ full_name, role }` as `profile` when calling `signUp(...)`.
- On success with a session, `router.replace('/(tabs)')`.

### Step 4 — Edit `app/(tabs)/profile.tsx` (Section 6)
- Import `getProfile`, `updateProfile`, and `useFocusEffect`.
- On focus, `getProfile(user.id)` → show `full_name`, a role badge (Student/Teacher), email, and user id.
- Add an edit flow that calls `updateProfile(user.id, { full_name })`.

### Step 5 — Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors.

### Step 6 — Run & test (Section 8)
```bash
npx expo start
```
Complete Section 8's steps (register teacher → see badge → register student → edit name → RLS check).

### Step 7 — Tick off Section 9's checklist
Don't continue to Phase 6 until all boxes are checked.

---

## 8. TESTING YOUR WORK — THE LAB

### Step 1: Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors.

### Step 2: Start the app
```bash
npx expo start
```

### Step 3: Test as a TEACHER
1. On the register screen, enter a name, email, password.
2. Choose **Teacher**.
3. Tap **Sign Up**.
4. ✅ You land on the tabs screen (email confirmation is off).
5. Open the **Profile** tab. ✅ You should see the **Teacher** badge, your name, and email.

### Step 4: Verify it saved to the cloud
1. Open **Supabase Dashboard** → **Table Editor** → `profiles`.
2. ✅ Your row has the `full_name` and `role = 'teacher'` you entered.

### Step 5: Test as a STUDENT + edit name
1. Sign out.
2. Register a **different** account, choosing **Student**.
3. ✅ Profile shows the **Student** badge.
4. On the Profile tab, tap your name → edit it → **Save**.
5. ✅ The new name appears, and `profiles.full_name` in Supabase is updated.

### Step 6: Test RLS (own data only)
1. While logged in as the student, the profile shown is **only yours**.
2. You cannot see other users' profiles (RLS blocks it).

---

## 9. LAB CHECKLIST (Tick these off)

| # | Task | Done? |
|---|---|---|
| 1 | `npx tsc --noEmit` passes | ☐ |
| 2 | Register screen has Full Name field | ☐ |
| 3 | Register screen has Student/Teacher picker | ☐ |
| 4 | Choosing Teacher and signing up → Profile shows Teacher badge | ☐ |
| 5 | `profiles` table in Supabase has `role = 'teacher'` | ☐ |
| 6 | Register a Student account → Profile shows Student badge | ☐ |
| 7 | Editing the name on Profile updates `full_name` in Supabase | ☐ |
| 8 | Signup with confirm-off lands on tabs (`router.replace`) | ☐ |
| 9 | I can explain why we UPDATE (not insert) the profile row | ☐ |
| 10 | I know which RLS policy lets a user edit their own profile | ☐ |

---

## 10. CHECK YOUR UNDERSTANDING (Quiz)

1. Why do we **UPDATE** the `profiles` row instead of INSERTING it after signup?
2. What RLS policy allows `updateProfile(...)` to work?
3. Why is `router.replace('/(tabs)')` used after signup instead of conditional rendering?
4. What role does a profile get if a student **doesn't** use the picker (i.e. chooses nothing)?
5. What does `maybeSingle()` do in `getProfile`, and why is it safe here?
6. Which cloud table stores each user's name and role?

*(Answers at the bottom — try them first!)*

---

## 11. COMMON ERRORS

### Error: `duplicate key value violates unique constraint "profiles_pkey"`
**Cause:** You tried to INSERT a second `profiles` row for a user, but the primary key (user id) already exists (the trigger made it).
**Fix:** Use UPDATE (like we do), OR pass the name/role through the signup in a way the trigger consumes. Our approach uses UPDATE.

### Error: `permission denied for table profiles` on update
**Cause:** RLS blocked it — the user id doesn't match the profile row, or the user isn't logged in.
**Fix:** Make sure the update uses `.eq('id', data.session.user.id)` and the user is actually logged in.

### Error: Profile shows nothing / null
**Cause:** `getProfile` returned null (maybe the profile row wasn't created, or RLS denied).
**Fix:** Check the `profiles` table in Supabase has a row for that user, and that the user is logged in so `auth.uid()` matches.

---

## 12. WHAT YOU SHOULD HAVE NOW

✅ Signup collects a **name** and a **role**
✅ The name/role are saved to the cloud `profiles` table
✅ The Profile screen shows **name, role (badge), email, ID**
✅ You can **edit your name** on the Profile screen
✅ Teachers and Students are now distinct — the foundation for teacher features in later phases

**People are no longer anonymous. You gave every user an identity.** 🎉

---

## CHECK YOUR UNDERSTANDING — ANSWERS

1. Because the **Phase 3 trigger** already created the profile row on signup with `id` + `email`. Inserting again would violate the primary key. We fill in the missing name/role with UPDATE.
2. **"Users can update their own profile"** — `using (auth.uid() = id)`.
3. Because of the Phase 2 discovery that `getSession()`/`onAuthStateChange` hang in Expo Go; explicit `router.replace()` navigation works reliably.
4. The default `role` value is `'student'` (from the Phase 3 schema).
5. It fetches 0 or 1 rows and doesn't error when there's no match, so `getProfile` can return `null` gracefully instead of throwing.
6. The `profiles` table (linked 1-to-1 with `auth.users`).

---

*Phase 5 completed 2026-09-03.*
