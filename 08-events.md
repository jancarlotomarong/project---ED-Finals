# Migration Phase 7 — Events (Supabase Service)

> This is a **student lab activity**. This is migration **Phase 7** (the file is named `08` only because `07` is taken by a separate visual-identity doc). In this phase we create a **dedicated `lib/events.ts`** service for managing events in the cloud, clean up the leftover event code in `lib/database.ts`, and **role-gate the Teacher tab** so only Teacher accounts can create events.

---

## HOW TO USE THIS DOCUMENT (Read Me First)

In this phase you will:
1. **LEARN** — why events deserve their own service module
2. **CODE** — `lib/events.ts`, a cleaner refactor, and a role gate
3. **VERIFY** — typecheck + test as a Teacher and as a Student

**Time needed:** ~30 minutes
**You will need:** Phases 4-6 (Supabase data layer + roles + teacher attendance).

---

## 1. WHAT ARE WE DOING AND WHY?

### The Problem

Right now, event logic is scattered:
- `createEvent` lives inside `lib/database.ts` (the old all-in-one file).
- The Teacher tab is available to **everyone** — even a Student account could open it and create events.
- There's no clean, re-usable "events" module that other screens can import.

### The Goal

1. **Create `lib/events.ts`** — one focused module for event operations:
   - `createEvent(...)`
   - `getEventsByTeacher(...)`
   - `getEventByCode(...)`
2. **Refactor** — remove `createEvent` from `lib/database.ts` (keep that file for attendance only).
3. **Role-gate the Teacher tab** — only users whose `profiles.role === 'teacher'` can use it.

### The Analogy: One Task per Toolbox Drawer

Think of `lib/` as a toolbox:
- `auth.ts` = authentication drawer
- `database.ts` = attendance drawer
- `profiles.ts` = profiles drawer
- `events.ts` = **events drawer** (new!)

Maybe some tools *could* fit in multiple drawers, but keeping one task per drawer makes it easy to find and fix code. That's what we're doing — giving events their **own drawer**.

---

## 2. NEW FILE: `lib/events.ts`

### 2a. The types

```typescript
export type Event = {
  eventId: string;   // the public event code (from the UI, e.g. EVT-2026-0002)
  title: string;
  start: string;
  end: string;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string;
};
```

| Type | Meaning |
|---|---|
| `Event` | The **app-facing** shape (what the Teacher screen builds — uses `eventId`, `start`, `end`). |
| `CloudEvent` | The **database row** shape (uses `event_code`, `start_time`, `end_time`, `created_by`). |

> 💡 The two shapes differ because the DB columns use `start_time`/`end_time` (Phase 3 reserved-word fix) while the app uses `start`/`end`. The service translates between them.

### 2b. `createEvent` — upsert by event_code

```typescript
export async function createEvent(
  event: Event
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('events').upsert(
    {
      event_code: event.eventId,
      title: event.title,
      start_time: event.start || null,
      end_time: event.end || null,
      created_by: user?.id ?? null,
    },
    { onConflict: 'event_code' }
  );

  return { error: error?.message ?? null };
}
```

| Line | Meaning |
|---|---|
| `supabase.auth.getUser()` | Get the logged-in user so we can set `created_by`. |
| `.upsert({...}, { onConflict: 'event_code' })` | Insert the event, or **update** it if the `event_code` already exists. |
| `created_by: user?.id ?? null` | Record who created it (needed by Phase 6's teacher view + RLS). |
| `return { error: ... }` | A small result the screen checks. |

### 2c. `getEventsByTeacher`

```typescript
export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as CloudEvent[];
}
```

- Fetches all events a given teacher created, newest first.
- Returns `[]` on error so callers don't crash.

### 2d. `getEventByCode`

```typescript
export async function getEventByCode(
  code: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CloudEvent;
}
```

- Looks up **one** event by its public code (useful for validating a scanned QR in later phases).
- `maybeSingle()` → returns `null` if not found.

---

## 3. REFACTOR: Clean up `lib/database.ts`

Before this phase, `lib/database.ts` had both attendance functions **and** `createEvent`. Now:

| Function | Old home | New home |
|---|---|---|
| `registerAttendance` | `lib/database.ts` | `lib/database.ts` (unchanged) |
| `getAttendanceHistory` | `lib/database.ts` | `lib/database.ts` (unchanged) |
| `createEvent` | `lib/database.ts` | **`lib/events.ts`** |
| `Event` type | `lib/database.ts` | **`lib/events.ts`** |

So we **removed** `createEvent` and the `Event` type from `lib/database.ts`. The `teacher.tsx` import line changed:

```typescript
// before
import { createEvent } from '@/lib/database';
// after
import { createEvent } from '@/lib/events';
```

> ✅ Because the function **name and arguments stayed the same**, the Teacher screen's `createEvent(eventData).then(...)` call still works — we just moved where it lives (encapsulation again, like Phase 4).

---

## 4. ROLE-GATE THE TEACHER TAB

### Why?

In Phase 5 we gave users a Student/Teacher role. But the Teacher tab was still open to everyone. A Student shouldn't be able to create attendance events.

### 4a. Check the role on screen focus

```typescript
const [role, setRole] = useState<Role | null>(null);

useFocusEffect(
  useCallback(() => {
    let active = true;
    if (!user) {
      setRoleLoading(false);
      return () => { active = false; };
    }
    getProfile(user.id).then((profile) => {
      if (!active) return;
      setRole(profile?.role ?? 'student');
      setRoleLoading(false);
    });
    return () => { active = false; };
  }, [user])
);
```

| Piece | Meaning |
|---|---|
| `useFocusEffect` | Re-check the role every time this tab is shown. |
| `getProfile(user.id)` | Read `profiles.role` (Phase 5). |
| `setRole(profile?.role ?? 'student')` | Default to student if no profile. |
| `let active = true` | Guard against state updates after unmount (a good React pattern). |

### 4b. Early-return guards

```typescript
if (roleLoading) {
  return ( /* "Checking your account..." */ );
}

if (role !== 'teacher') {
  return (
    <View>
      <Ionicons name="lock-closed-outline" ... />
      <Text>Teachers Only</Text>
      <Text>Only teacher accounts can create events.</Text>
    </View>
  );
}

return ( /* the normal create-event form */ );
```

- **Teachers** → see the form.
- **Students** → see a "Teachers Only" lock screen.
- While the role loads → a brief "Checking your account..." state.

> 💡 This is the app-side half of role-based access control. The database RLS (Phase 3) is the other half. Together they protect event creation.

---

## 5. BEFORE vs AFTER — SIDE BY SIDE

| Aspect | BEFORE (Phase 6) | AFTER (Phase 7) |
|---|---|---|
| Event service | inside `lib/database.ts` | dedicated `lib/events.ts` |
| `getEventsByTeacher` | inline in `attendance.ts` | available in `events.ts` |
| `getEventByCode` | — | new, for QR validation |
| Teacher tab | open to everyone | **role-gated** (Teachers only) |
| `lib/database.ts` | attendance + events | attendance only |

---

## 5.5. STEP-BY-STEP EXECUTION GUIDE (what to type, in order)

> This turns Sections 2–4 into a "do it now" checklist. Edit the files in this order.

### Step 1 — Create `lib/events.ts` (NEW file, Section 2)
Create `lib/events.ts` with:
- Types `Event` (app shape) and `CloudEvent` (DB shape).
- `createEvent(event)` — `supabase.from('events').upsert({ event_code, title, start_time, end_time, created_by: user?.id }, { onConflict: 'event_code' })`. Get the user with `supabase.auth.getUser()` first.
- `getEventsByTeacher(teacherId)` — `.eq('created_by', teacherId).order('created_at', { ascending: false })`, return `[]` on error.
- `getEventByCode(code)` — `.eq('event_code', code).maybeSingle()`, return `null` on error/not-found.

### Step 2 — Clean up `lib/database.ts` (Section 3)
- Remove the `Event` type and `createEvent` from `lib/database.ts` (they moved to `lib/events.ts`).
- Keep `registerAttendance`, `getAttendanceHistory`, and their types.

### Step 3 — Edit `app/(tabs)/teacher.tsx` (Section 4) — role gate + import
- Change the import from `@/lib/database` to `@/lib/events` for `createEvent`.
- Add `useAuth`, `getProfile`, and `useFocusEffect`.
- Add `role`/`roleLoading` state; on focus, `getProfile(user.id)` → `setRole(profile?.role ?? 'student')`.
- Add the early-return guards: while `roleLoading` → "Checking your account..."; if `role !== 'teacher'` → "Teachers Only" lock screen.

### Step 4 — Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors (this is the moment those duplicate `Event` errors would surface — fix imports in `lib/events.ts`).

### Step 5 — Run & test (Section 6)
```bash
npx expo start
```
Complete Section 6 (student sees "Teachers Only" → teacher creates event + QR → verify `created_by` in Supabase).

### Step 6 — Tick off Section 7's checklist
Don't continue to Phase 8 until all boxes are checked.

---

## 6. TESTING YOUR WORK — THE LAB

### Step 1: Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors.

### Step 2: Start the app
```bash
npx expo start
```

### Step 3: Test as a Student (the gate)
1. Log in as a **Student** account.
2. Open the **Teacher** tab.
3. ✅ You should see the **"Teachers Only"** lock screen, NOT the form.

### Step 4: Test as a Teacher (create an event)
1. Log out, log in as a **Teacher** account.
2. Open the **Teacher** tab.
3. ✅ You see the create-event form.
4. Create an event → a QR appears as before.

### Step 5: Verify in Supabase
1. Open **Table Editor** → `events`.
2. ✅ Your new event row has the `event_code`, `start_time`/`end_time`, and `created_by` set to the Teacher's user id.

### Step 6: Regression — Student can still scan
1. Log in as the Student again.
2. ✅ The **Scan**, **History**, and **Profile** tabs still work normally; only the Teacher tab is locked.

---

## 7. LAB CHECKLIST (Tick these off)

| # | Task | Done? |
|---|---|---|
| 1 | `npx tsc --noEmit` passes | ☐ |
| 2 | `lib/events.ts` created with 3 functions | ☐ |
| 3 | `createEvent` removed from `lib/database.ts` | ☐ |
| 4 | `teacher.tsx` imports `createEvent` from `lib/events` | ☐ |
| 5 | Student cannot access the Teacher form (sees "Teachers Only") | ☐ |
| 6 | Teacher can still create an event + QR | ☐ |
| 7 | Event row in Supabase has `created_by` set | ☐ |
| 8 | Student's Scan/History/Profile still work | ☐ |
| 9 | I can explain why events got their own module | ☐ |
| 10 | I can explain the difference between app-side role gate and DB RLS | ☐ |

---

## 8. CHECK YOUR UNDERSTANDING (Quiz)

1. Why do we give events their **own** module (`lib/events.ts`) instead of leaving `createEvent` in `lib/database.ts`?
2. What does `onConflict: 'event_code'` do in `createEvent`?
3. Name the TWO layers that protect event creation.
4. What does `getEventByCode` return if the code isn't found, and which Supabase method makes that safe?
5. Why didn't the Teacher screen's `createEvent(...).then(...)` call need changes after we moved the function?
6. What is `profiles.role` used for in this phase?

*(Answers at the bottom — try them first!)*

---

## 9. COMMON ERRORS

### Error: TypeScript "Cannot find name 'Event'"
**Cause:** `Event` was removed from `lib/database.ts` but something still imports it from there.
**Fix:** Import `Event` (or `createEvent`) from `@/lib/events` instead.

### Error: Student can still create events
**Cause:** The role gate isn't running, or `profiles.role` is `'student'`.
**Fix:** Make sure `useFocusEffect` runs `getProfile`, and that the account was registered with the **Teacher** role (Phase 5).

### Error: Event not showing in the teacher's History view
**Cause:** `created_by` is null (the event was created while not logged in).
**Fix:** Create the event while logged in as the teacher so `created_by` is set.

---

## 10. WHAT YOU SHOULD HAVE NOW

✅ A dedicated `lib/events.ts` service
✅ Cleaner `lib/database.ts` (attendance only)
✅ `getEventsByTeacher` and `getEventByCode` ready for future phases
✅ The Teacher tab is **role-gated** — Students are locked out
✅ Both app-side (role check) and DB-side (RLS) protection

**Events are now cleanly organized AND protected. Only real Teachers can create them.** 🎉

---

## CHECK YOUR UNDERSTANDING — ANSWERS

1. To keep one task per module (separation of concerns). `database.ts` was becoming a grab-bag; events now live in their own drawer so any screen can find and reuse them.
2. It tells the DB to **update** the existing row instead of inserting a duplicate when an event with that `event_code` already exists.
3. (1) The app-side role gate in the Teacher screen, and (2) the database RLS policies from Phase 3.
4. It returns `null` — `maybeSingle()` returns 0 or 1 rows without erroring, so "not found" is a clean `null`, not a crash.
5. Because we kept the **same function name and arguments** (encapsulation). The screen's call site doesn't care where the function lives.
6. It determines whether the user may see/use the Teacher tab (the role gate).

---

*Migration Phase 7 completed 2026-09-03.*
