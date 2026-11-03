# Phase 4 — Supabase Database Service (`lib/database.ts`)

> This is a **student lab activity**. In Phase 3 you built the *tables*. Now you will write the **code** that talks to those tables. By the end of this phase, your app will read and write **real cloud data** instead of a local file.

---

## HOW TO USE THIS DOCUMENT (Read Me First)

In this phase you will:
1. **LEARN** — read the plain-English explanations
2. **COMPARE** — see the OLD (SQLite) code vs the NEW (Supabase) code side by side
3. **VERIFY** — run the type check and test your app

**Time needed:** ~30 minutes
**You will need:** The code from Phases 1-3 (Supabase client + the schema you built)

---

## 1. WHAT ARE WE DOING AND WHY?

### The Big Picture

Your app currently has a file called **`lib/database.ts`** that talks to **local SQLite**. That file has 3 functions:

| Function | What it does | Used by screen |
|---|---|---|
| `registerAttendance(payload, studentId)` | Saves a scan into the `attendance` table | `Scan` tab |
| `getAttendanceHistory(studentId)` | Reads a student's attendance history | `History` tab |
| `createEvent(event)` | Saves a new event | `Teacher` tab |

Today we **rewrite the internals** of these 3 functions to talk to **Supabase** instead of SQLite — **without changing how the screens call them**. That way the screens don't need to change at all.

> 💡 **KEY IDEA — "The screens don't change":** The screens (Scan, History, Teacher) call `registerAttendance(...)`, `getAttendanceHistory(...)`, and `createEvent(...)`. As long as we keep the **same function names, same arguments, same return types**, the screens keep working. We only swap what's *inside* the functions. This is called **encapsulation** — the screens don't need to know how the data is stored.

### The Analogy: Changing the Engine, Not the Car

Think of the app as a car and `lib/database.ts` as the **engine**:
- The **steering wheel** (the screens) stays the same — you press the same pedals.
- But we're swapping a **petrol engine** (SQLite) for an **electric engine** (Supabase).
- The driver doesn't need to learn a new way to drive — the engine just works differently under the hood.

---

## 2. THE OLD CODE vs THE NEW CODE

### BEFORE (SQLite) — what it looked like

The old `lib/database.ts` had to:
1. Open a local SQLite database
2. Write raw SQL strings like `INSERT INTO events`
3. Manually map rows

It looked roughly like this:

```typescript
import * as SQLite from 'expo-sqlite';

// Open the local database file
const db = SQLite.openDatabaseSync('qr_att.db');

db.execSync(`
  CREATE TABLE IF NOT EXISTS attendance (...);
  CREATE TABLE IF NOT EXISTS events (...);
`);

// Save a scan
export function registerAttendance(payload: string, studentId: string) {
  // ...parse JSON, write raw SQL INSERT INTO attendance ...
  db.runSync('INSERT INTO attendance (studentId, eventId, scannedAt) VALUES (?, ?, ?)');
}
```

**Problems with this:**
- Every action needs a raw SQL string
- Data lives only on YOUR device
- No real users, no security

### AFTER (Supabase) — the new version

The new `lib/database.ts`:
1. Imports the Supabase client from `lib/supabase.ts`
2. Uses the **Supabase query builder** (`.from('table').select().insert()`) — no raw SQL strings
3. Sends data to the **cloud** tables you built in Phase 3

---

## 3. READING THE NEW CODE — LINE BY LINE

Here is the new file, explained section by section.

### 3a. The Imports and Types

```typescript
import { supabase } from './supabase';
```

| Line | Meaning |
|---|---|
| `import { supabase } from './supabase';` | Bring in the Supabase client you made in Phase 1. This is the object that connects your app to the cloud. |

Then we define **TypeScript types** — the "shapes" of the data we send and receive:

```typescript
export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};
```

| Type | Meaning |
|---|---|
| `AttendanceRecord` | One row shown in the History list. Note `id` is now a **string** (uuid) not a number. |
| `Event` | The data needed to create an event (matches what the Teacher screen builds). |

```typescript
type EventPayload = {
  v: number;       // version 1 = our QR format
  event: string;   // the event code (e.g. EVT-2026-0002)
  title?: string;  // optional title
  start?: string;  // optional start time
  end?: string;    // optional end time
};

export type RegisterResult = {
  success: boolean;     // did it work?
  message: string;      // what to tell the user
  eventTitle?: string;  // optional event name for the message
};
```

| Type | Meaning |
|---|---|
| `EventPayload` | The decoded contents of a scanned QR code. |
| `RegisterResult` | What the Scan screen gets back after a scan (so it can show a success or error message). |

> ⚠️ **Important:** We kept these types **named and shaped the same** as before. That's why the screens (`scan.tsx`, `history.tsx`, `teacher.tsx`) don't need any changes.

---

### 3b. `registerAttendance` — The Scan Function

This is the biggest function. It's what runs when a student scans a QR code. Let's walk through it in steps.

#### Step 1 — Decode and validate the QR

```typescript
let payload: EventPayload;
try {
  payload = JSON.parse(rawPayload);
} catch {
  return { success: false, message: 'Invalid QR code.' };
}

if (payload.v !== 1 || !payload.event) {
  return { success: false, message: 'Not an attendance QR code.' };
}
```

| Line | Meaning |
|---|---|
| `JSON.parse(rawPayload)` | Convert the QR text into a JavaScript object. |
| `try / catch` | If the text isn't valid JSON, return "Invalid QR code." |
| `payload.v !== 1` | Reject it unless `v` equals 1 (our QR format version). |
| `!payload.event` | Reject it if there's no event code. |

#### Step 2 — Check the time window

```typescript
const now = Date.now();
const start = payload.start ? new Date(payload.start).getTime() : null;
const end = payload.end ? new Date(payload.end).getTime() : null;

if (start && now < start) {
  return { success: false, message: 'Event has not started yet.' };
}
if (end && now > end) {
  return { success: false, message: 'Event has already ended.' };
}
```

| Line | Meaning |
|---|---|
| `Date.now()` | Current time in milliseconds. |
| `new Date(payload.start).getTime()` | Convert the start time string to milliseconds so we can compare. |
| `if (start && now < start)` | If the event starts in the *future*, refuse. |
| `if (end && now > end)` | If the event already *ended*, refuse. |

#### Step 3 — Look up the event (or create it)

```typescript
const title = payload.title ?? payload.event;

let event: { id: string; title: string } | null = null;

const { data: foundEvent, error: findError } = await supabase
  .from('events')
  .select('id, title')
  .eq('event_code', payload.event)
  .maybeSingle();

if (findError) {
  return { success: false, message: 'Could not check event.' };
}
```

| Piece | Meaning |
|---|---|
| `.from('events')` | Which cloud table to talk to. |
| `.select('id, title')` | Which columns to fetch back. |
| `.eq('event_code', payload.event)` | Find only the row whose `event_code` matches the scanned code. |
| `.maybeSingle()` | Expect 0 or 1 rows (won't error if 0). |
| `const { data, error } = await ...` | Supabase returns an object with `data` (the rows) and `error` (if any). |

If the event **doesn't exist** yet, we create it:

```typescript
if (foundEvent) {
  event = foundEvent;
} else {
  const { data: newEvent, error: insertError } = await supabase
    .from('events')
    .insert([
      {
        event_code: payload.event,
        title,
        start_time: payload.start ?? null,
        end_time: payload.end ?? null,
      },
    ])
    .select('id, title')
    .single();

  if (insertError) {
    return { success: false, message: 'Could not create event.' };
  }
  event = newEvent;
}
```

| Column in cloud table | Where the value comes from |
|---|---|
| `event_code` | `payload.event` (the scanned code) |
| `title` | `payload.title` |
| `start_time` | `payload.start` (note the `_time` suffix — from Phase 3's reserved-word fix) |
| `end_time` | `payload.end` |

> ⚠️ **Remember from Phase 3:** We write to `start_time` and `end_time` — NOT `start` and `end` — because those are reserved words in PostgreSQL.

#### Step 4 — Record the attendance

```typescript
const { error: attError } = await supabase.from('attendance').insert([
  {
    student_id: studentId,
    event_id: event.id,
  },
]);

if (attError) {
  if (attError.code === '23505') {
    return {
      success: false,
      message: 'Already registered for this event.',
      eventTitle: event.title,
    };
  }
  return { success: false, message: attError.message };
}

return { success: true, message: 'Attendance recorded!', eventTitle: event.title };
```

| Piece | Meaning |
|---|---|
| `.from('attendance').insert([{ student_id, event_id }])` | Add a row linking which student scanned which event. |
| `attError.code === '23505'` | **23505 is PostgreSQL's "unique constraint violated" code.** Remember Phase 3's `unique (student_id, event_id)`? This is it firing — the student already scanned this event. We turn it into a friendly message. |
| `return { success: true, ... }` | Success — the scan was recorded. |

---

### 3c. `getAttendanceHistory` — The History Function

```typescript
export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, scanned_at, events ( event_code, title )')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? '',
    scannedAt: row.scanned_at,
  }));
}
```

| Piece | Meaning |
|---|---|
| `.select('id, scanned_at, events ( event_code, title )')` | Fetch the attendance row AND pull the `event_code` and `title` from the linked `events` table (a **JOIN** written as `events ( ... )`). |
| `.eq('student_id', studentId)` | Only this student's rows. |
| `.order('scanned_at', { ascending: false })` | Newest first. |
| `row.events?.event_code` | Access the joined event's code. `?.` means "if `events` is null, don't crash." |
| `?? ''` | If it's null/undefined, use an empty string instead. |
| `.map(...)` | Turn each raw Supabase row into an `AttendanceRecord` so the History screen gets the same shape as before. |

> 💡 **KEY IDEA — Column name mapping:** The cloud table column is `scanned_at`, but the History screen expects `scannedAt`. We **rename** them in `.map()`. This is how we keep the screen working even though the database column names differ.

---

### 3d. `createEvent` — The Teacher Function

```typescript
export async function createEvent(event: Event): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from('events').upsert(
    {
      event_code: event.eventId,
      title: event.title,
      start_time: event.start || null,
      end_time: event.end || null,
      created_by: user?.id ?? null,
    },
    { onConflict: 'event_code' }
  );
}
```

| Piece | Meaning |
|---|---|
| `supabase.auth.getUser()` | Fetch the currently logged-in user (so we can record who created the event). |
| `.upsert(...)` | Insert, or if the `event_code` already exists, **update** it (Supabase's version of "INSERT OR REPLACE"). |
| `onConflict: 'event_code'` | Tell Supabase WHICH unique column to check for a conflict — the `event_code`. |
| `created_by: user?.id ?? null` | Record the teacher's user id (or null if not logged in). |

---

## 4. BEFORE vs AFTER — SIDE BY SIDE

| Aspect | BEFORE (SQLite) | AFTER (Supabase) |
|---|---|---|
| Import | `expo-sqlite` | `./supabase` (the client) |
| Storage location | Local phone file | Cloud (Supabase) |
| SQL | Raw SQL strings (`INSERT INTO ...`) | Query builder (`.from().insert().select()`) |
| User identity | Passed-in text string | Real `auth.uid()` (RLS enforces it) |
| Duplicate scan | Manual check | Database `unique` constraint (error 23505) |
| Event create | `INSERT OR REPLACE` | `.upsert(..., { onConflict })` |
| History | Manual join | Supabase nested `events ( ... )` select |
| Screens changed? | — | **None** |

---

## 5. HOW THE FLOW WORKS (from scan to database)

```
  Student opens Scan tab
        │
        ▼
  Camera reads QR → registerAttendance(rawPayload, user.id)
        │
        ├─ Parse JSON (Step 1)
        ├─ Check time window (Step 2)
        ├─ Find or create event by event_code (Step 3)
        └─ INSERT into attendance (student_id, event_id)  (Step 4)
              │
              ▼
       Supabase RLS checks:
       "Is auth.uid() == student_id?"  →  yes ✅ / no ❌
              │
              ▼
       Row saved to cloud attendance table
        │
        ▼
  Scan screen shows "Attendance recorded!"  (or "Already registered")
```

---

## 5.5. STEP-BY-STEP EXECUTION GUIDE (what to type, in order)

> Follow these steps in your editor to **do** Phase 4. This is the "how to perform it" version of the theory above.

### Step 1 — Confirm Phase 1 & 3 are done
- [ ] `lib/supabase.ts` exists (Phase 1).
- [ ] `supabase/schema.sql` has been run in your Supabase project (Phase 3).
- [ ] Run `npm ls @supabase/supabase-js` → shows a version.

### Step 2 — Create the new service code in `lib/database.ts`
Open `lib/database.ts` and replace its SQLite contents with the Supabase version. It needs these pieces:

1. **Import the client** at the top:
   ```typescript
   import { supabase } from './supabase';
   ```
2. **Define / keep the shared types** (`AttendanceRecord`, `Event`, `EventPayload`, `RegisterResult`) exactly as shown in Section 3a.
3. **Implement `registerAttendance`** (Section 3b) — the four steps: decode QR, time window, find-or-create event, insert attendance, handle `23505`.
4. **Implement `getAttendanceHistory`** (Section 3...) — nested `.select('... events ( event_code, title )')` and re-map to `AttendanceRecord`.
5. **Implement `createEvent`** — `.upsert(..., { onConflict: 'event_code' })` as shown.

> ⚠️ **IMPORTANT:** Keep the function names and signatures identical to the SQLite versions (`registerAttendance(payload, studentId)`, `getAttendanceHistory(studentId)`, `createEvent(event)`). The screens depend on them.
>
> 📌 **A note for the future (don't worry now):** Later phases reorganize these functions on purpose. Phase 7 moves `createEvent` into `lib/events.ts`; Phase 8 moves the QR parsing into `lib/qr.ts`; Phase 9 moves `registerAttendance`/`getAttendanceHistory` into `lib/attendance.ts` and deletes `lib/database.ts`. That's normal refactoring — you'll do it step by step. For THIS phase, everything stays in `lib/database.ts`.

### Step 3 — Do NOT change any screens
Leave `scan.tsx`, `history.tsx`, and `teacher.tsx` untouched. If they already compile and call these three functions, they keep working.

### Step 4 — Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors. If you get type errors on the screens, check you exported all the same types/names.

### Step 5 — Run the app and complete the TESTING checklist in Section 6
```bash
npx expo start
```
Work through Section 6's five steps (teacher creates event → student scans → duplicate guard → verify in Table Editor).

### Step 6 — Tick off the Section 7 checklist
Only move on to Phase 5 once every checkbox in Section 7 is checked.

---

## 6. TESTING YOUR WORK — THE LAB CHECKLIST

### Step 1: Type check (do this FIRST)

In your project's terminal, run:

```bash
npx tsc --noEmit
```

**Expected:** no output (no errors). If you see errors, fix them before continuing.

### Step 2: Start the app

```bash
npx expo start
```

Then open it in **Expo Go** on your phone.

### Step 3: Test the Teacher → Student flow

1. **Log in** (or sign up) as a teacher account.
2. Go to the **Teacher** tab, create an event, and note the QR code.
3. **Log out.**
4. **Log in** as a *different* student account.
5. Go to the **Scan** tab and scan the teacher's QR code.
6. ✅ **Expected:** "Attendance recorded!"
7. Go to the **History** tab.
8. ✅ **Expected:** The event appears in the history list with its title.

### Step 4: Test the duplicate-scan guard

1. Scan the SAME QR code a second time.
2. ✅ **Expected:** "Already registered for this event." (error 23505 handled)

### Step 5: Verify it's REALLY in the cloud (not local!)

1. Open the **Supabase Dashboard** → **Table Editor** → `attendance`.
2. ✅ **Expected:** You see the row you just created, with `student_id` = your logged-in user id and `event_id` = the event's uuid.
3. Check `events` too — you should see your event with `event_code`, `start_time`, `end_time`.

> 💡 **This proves it works *and* that it's cloud-hosted.** If uninstall Expo Go and log in again, the history is still there — because it's in Supabase, not on your phone.

---

## 7. LAB CHECKLIST (Tick these off as you work)

| # | Task | Done? |
|---|---|---|
| 1 | `npx tsc --noEmit` runs with no errors | ☐ |
| 2 | Teacher can create an event and see a QR code | ☐ |
| 3 | Different student logs in and scans the QR | ☐ |
| 4 | "Attendance recorded!" shows on a valid scan | ☐ |
| 5 | History tab shows the scanned event | ☐ |
| 6 | Scanning the same code twice shows "Already registered" | ☐ |
| 7 | The attendance row appears in the Supabase `attendance` table | ☐ |
| 8 | The event row appears in the Supabase `events` table | ☐ |
| 9 | I understand why the screens didn't need to change | ☐ |
| 10 | I know what error code `23505` means | ☐ |
| 11 | I know why we write `start_time` / `end_time` not `start`/`end` | ☐ |
| 12 | I can explain how `.upsert()` differs from `.insert()` | ☐ |

---

## 8. CHECK YOUR UNDERSTANDING (Quiz)

1. Why didn't the screens (`scan.tsx`, `history.tsx`, `teacher.tsx`) need any changes?
2. What does `attError.code === '23505'` tell us?
3. How do we rename a database column like `scanned_at` to the shape the screen expects (`scannedAt`)?
4. What's the difference between `.insert()` and `.upsert()`?
5. Why do we look up (`select`) an event by `event_code` before inserting attendance?
6. What is `.maybeSingle()` used for?
7. Where does the value for `student_id` come from when the Scan screen calls `registerAttendance`?
8. What would happen if someone scanned a QR while NOT logged in (hint: think about RLS + `auth.uid()`)?

*(Answers at the bottom — try them first!)*

---

## 9. COMMON ERRORS

### Error: `row.events is undefined`
**Cause:** The nested select didn't return the join. Make sure you wrote `events ( event_code, title )` exactly (with the space).

### Error: `permission denied for table events` / insert fails with RLS error
**Cause:** The logged-in user's RLS policy doesn't allow the insert.
**Fix:** Confirm the user is actually logged in (`user?.id` exists), and check the Phase 3 policies allow `insert` for authenticated users.

### Error: always "Could not create event."
**Cause:** The `events.insert` failed (maybe missing permission, or `event_code` conflicts with an existing row that `.maybeSingle()` didn't find).
**Fix:** Check `insertError` — for a `23505` here you might prefer `.upsert()` like the Teacher flow.

### Error: "Already registered" even on first scan
**Cause:** The student already has an attendance row for that event.
**Fix:** This usually means they scanned before. Insert a new event/code to test, or delete the row in Table Editor.

---

## 10. WHAT YOU SHOULD HAVE NOW

✅ `lib/database.ts` talks to **Supabase** (not SQLite)
✅ Scans create real cloud `attendance` rows
✅ History reads from the cloud
✅ Teacher creates cloud `events`
✅ Duplicate scans are rejected by the database
✅ All screens still work — **untouched**

**You just swapped the app's engine from local to cloud. Great work.** 🎉

---

## CHECK YOUR UNDERSTANDING — ANSWERS

1. Because we kept the same function names, arguments, and return shapes (`AttendanceRecord`, `RegisterResult`). The screens only depend on that contract ("encapsulation").
2. That a **unique constraint** was violated — specifically `unique (student_id, event_id)` — meaning the student already registered for that event.
3. In the `.map()` we read `row.scanned_at` and output a property named `scannedAt`.
4. `.insert()` always adds a new row and fails on a conflict. `.upsert()` inserts but *updates* the existing row if the conflict column (e.g. `event_code`) matches.
5. To reuse an already-created event (and get its real `events.id` uuid) rather than creating a duplicate event for every scan. Attendance needs the `event_id`.
6. To fetch 0 or 1 rows without erroring when there's no match, so we can tell "not found" apart from "error."
7. From `useAuth()` in the Scan screen — `user?.id ?? 'unknown'`, which is the logged-in user's auth uuid.
8. RLS would reject it (`auth.uid()` is null, so `auth.uid() = student_id` fails) and the INSERT would be denied — the scan would not be recorded.

---

*Phase 4 completed 2026-09-03.*
