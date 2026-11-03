# Migration Phase 9 — QR Attendance (Register Against Cloud Events)

> This is a **student lab activity**. This is migration **Phase 9**. In this phase we **consolidate all attendance logic into `lib/attendance.ts`** and make the scanner validate against **cloud events** using the `getEventByCode` path (created in Phase 7). By the end, every scan is registered against a row in the cloud `events` table, the little green/grey SQLite-era file `lib/database.ts` is gone, and scanning is centralized in one place.

---

## HOW TO USE THIS DOCUMENT (Read Me First)

In this phase you will:
1. **LEARN** — why attendance is moving to its own module and how the scanner resolves an event in the cloud
2. **CODE** — consolidate `registerAttendance` + `getAttendanceHistory` into `lib/attendance.ts`, reuse `getEventByCode`, and remove the legacy file
3. **VERIFY** — typecheck + a real Student scan round trip

**Time needed:** ~30 minutes
**You will need:** Phases 4-8 (Supabase data layer, QR format service, events service).

---

## 1. WHAT ARE WE DOING AND WHY?

### The Situation Before

Attendance code was split across two files:
- `lib/database.ts` held `registerAttendance` and `getAttendanceHistory` (leftovers from the SQLite era).
- `lib/attendance.ts` held the **teacher** attendance queries (Phase 6).

That's confusing — attendance should live in **one** place. And the scanner hand-wrote its own "find event by code" query even though `lib/events.ts` already had a `getEventByCode` helper (from Phase 7) that it never used.

### The Goal

1. **Consolidate** all attendance into `lib/attendance.ts` (student register/history + teacher views).
2. **Reuse** `getEventByCode` in the scanner so the "find the event" logic lives in one place.
3. **Bid farewell** to `lib/database.ts` — trade the old all-in-one file for the clear service modules we've built.

### The Analogy: One Main Entrance

Imagine the school has two attendance desks — one in the old building, one in the new. Students (the scanner) sometimes line up at the wrong one. Phase 9 **closes the old building** and puts **everyone at one main entrance** (`lib/attendance.ts`). There's one queue, one rulebook, and it's easy to tell who's here and who isn't.

---

## 2. WHERE ATTENDANCE LIVES NOW

| Function | Phase 6 home | Phase 9 home |
|---|---|---|
| `registerAttendance` | `lib/database.ts` | **`lib/attendance.ts`** |
| `getAttendanceHistory` | `lib/database.ts` | **`lib/attendance.ts`** |
| `getTeacherEventAttendance` | `lib/attendance.ts` | `lib/attendance.ts` (unchanged) |
| `getTeacherEventSummary` | `lib/attendance.ts` | `lib/attendance.ts` (unchanged) |

> ✅ All four attendance functions now live in `lib/attendance.ts`. `lib/database.ts` is deleted.

---

## 3. THE SCAN-TO-REGISTER FLOW (Cloud-Backed)

Here's what happens when a Student scans a QR. This is the heart of "QR attendance":

```
Scan QR text
    │
    ▼
parseQRPayload(raw)        (Phase 8 — validate v:1 format)
    │ ok
    ▼
Check time window           "not started yet" / "already ended"
    │ within window
    ▼
getEventByCode(event)       (Phase 7 helper — find the cloud event)
    │ not found?
    ▼ create it
insert event row            (into cloud `events`)
    │
    ▼
insert attendance row       (student_id + event_id) into cloud `attendance`
    │ unique conflict 23505?
    ▼ "Already registered"
    │
    ▼
"Attendance recorded!"
```

### The code, line by line

```typescript
import { parseQRPayload } from './qr';
import { getEventByCode } from './events';

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);          // 1. validate format
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }
  const payload = parsed.payload;

  const now = Date.now();                             // 2. time window
  const start = payload.start ? new Date(payload.start).getTime() : null;
  const end = payload.end ? new Date(payload.end).getTime() : null;

  if (start && now < start) {
    return { success: false, message: 'Event has not started yet.' };
  }
  if (end && now > end) {
    return { success: false, message: 'Event has already ended.' };
  }

  const title = payload.title ?? payload.event;
  let event: { id: string; title: string } | null = null;

  const foundEvent = await getEventByCode(payload.event);   // 3. find in cloud
  if (foundEvent) {
    event = foundEvent;
  } else {
    // 3b. not found → create it
    const { data: newEvent, error: insertError } = await supabase
      .from('events')
      .insert([{ event_code: payload.event, title, start_time: payload.start ?? null, end_time: payload.end ?? null }])
      .select('id, title')
      .single();
    if (insertError) {
      return { success: false, message: 'Could not create event.' };
    }
    event = newEvent;
  }

  // 4. record attendance
  const { error: attError } = await supabase.from('attendance').insert([
    { student_id: studentId, event_id: event.id },
  ]);

  if (attError) {
    if (attError.code === '23505') {                   // 5. duplicate
      return { success: false, message: 'Already registered for this event.', eventTitle: event.title };
    }
    return { success: false, message: attError.message };
  }

  return { success: true, message: 'Attendance recorded!', eventTitle: event.title };
}
```

### Why this is "cloud-backed"

- The event is **resolved in the cloud** via `getEventByCode` (a `SELECT ... FROM events WHERE event_code = ?`).
- If it doesn't exist yet (e.g. a QR from before the event was saved), the scanner **creates** it in `events` first.
- The attendance row always references a real `event_id` in the cloud — so the teacher's view (Phase 6) and the student history both read from the same tables.

### The `23505` duplicate guard

PostgreSQL enforces a unique constraint on `(student_id, event_id)`. If a student scans twice, the second insert **fails with code `23505`** — we catch it and reply "Already registered for this event." instead of crashing or double-counting.

---

## 4. THE "FIND" PATH IS NOW SHARED

Before Phase 9, the scanner wrote its own query:

```typescript
// before (hand-written, duplicated)
const { data: foundEvent } = await supabase
  .from('events').select('id, title').eq('event_code', payload.event).maybeSingle();
```

After Phase 9:

```typescript
// after (shared helper from lib/events.ts)
const foundEvent = await getEventByCode(payload.event);
```

| | Before | After |
|---|---|---|
| Where the lookup query lives | inline in `registerAttendance` | `lib/events.ts` (`getEventByCode`) |
| Used by | only the scanner | any future feature needing a code lookup |
| Duplication | in 1 place | 0 (single source) |

> 💡 This is the **same "single source of truth" idea** as Phase 8, applied to the event lookup.

---

## 5. REMOVING `lib/database.ts`

Once `registerAttendance` and `getAttendanceHistory` moved to `lib/attendance.ts`, nothing imported `lib/database.ts` anymore. So we **deleted it**.

The screens updated their imports:

```typescript
// scan.tsx
import { registerAttendance } from '@/lib/attendance';

// history.tsx
import { getAttendanceHistory, type AttendanceRecord } from '@/lib/attendance';
```

> 🎉 The all-in-one file from the SQLite era is gone. The `lib/` folder now has clean, single-purpose service modules: `supabase.ts`, `auth.ts`, `profiles.ts`, `events.ts`, `qr.ts`, `attendance.ts`.

---

## 6. BEFORE vs AFTER — SIDE BY SIDE

| Aspect | BEFORE (Phase 8) | AFTER (Phase 9) |
|---|---|---|
| Attendance location | split: `database.ts` + `attendance.ts` | **one file** (`attendance.ts`) |
| Event lookup in scanner | hand-written inline query | shared `getEventByCode` |
| `lib/database.ts` | exists (attendance leftovers) | **deleted** |
| Scanner writes to | cloud `events` + `attendance` | cloud `events` + `attendance` (unchanged) |
| Duplicate handling | `23505` check | `23505` check (unchanged) |

---

## 6.5. STEP-BY-STEP EXECUTION GUIDE (what to type, in order)

> This turns Sections 2–5 into a "do it now" checklist. Edit the files in this order.

### Step 1 — Move `registerAttendance` + `getAttendanceHistory` into `lib/attendance.ts`
1. Open `lib/attendance.ts` (from Phase 6).
2. Add the imports: `import { parseQRPayload } from './qr';` and `import { getEventByCode } from './events';`.
3. Copy `registerAttendance` and `getAttendanceHistory` (and the `AttendanceRecord` / `RegisterResult` types) from `lib/database.ts` into `lib/attendance.ts`.
4. In `registerAttendance`, replace the find-event block:
   - **Before:** hand-written `supabase.from('events').select('id, title').eq('event_code', payload.event).maybeSingle()`.
   - **After:** `const foundEvent = await getEventByCode(payload.event); if (foundEvent) { event = foundEvent; } else { /* create it */ }`.
5. Keep the time-window checks, the find-or-create fallback, the `attendance` insert, and the `23505` duplicate guard exactly as they are.

### Step 2 — Delete `lib/database.ts`
1. Confirm nothing imports `@/lib/database` anymore (search the project).
2. `Delete lib/database.ts` — its contents now live in `lib/attendance.ts` (+ events/qr).

### Step 3 — Repoint the two screens
- `app/(tabs)/scan.tsx`: change `import { registerAttendance } from '@/lib/database';` → `from '@/lib/attendance'`.
- `app/(tabs)/history.tsx`: change the `getAttendanceHistory` / `AttendanceRecord` import from `@/lib/database` → `@/lib/attendance`.

### Step 4 — Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors (and definitely no error mentioning `lib/database`).

### Step 5 — Run & test (Section 7)
```bash
npx expo start
```
Complete Section 7 (student scans teacher QR → duplicate scan message → early/late window → verify Supabase rows → teacher count + student history reflect the scan).

### Step 6 — Tick off Section 8's checklist + update any doc references to `lib/database`
Search the docs for stale `lib/database.ts` references and add a note if needed (Phases 7–9 intentionally moved everything out of it).

---

## 7. TESTING YOUR WORK — THE LAB

### Step 1: Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors (and definitely no error about `lib/database` — it's gone).

### Step 2: Start the app
```bash
npx expo start
```

### Step 3: Register a scan (Student)
1. Log in as a **Student**.
2. Create an event as a Teacher first (or use an event whose QR the teacher just made).
3. Scan the QR.
4. ✅ "Attendance recorded!"

### Step 4: Duplicate scan
1. Scan the **same QR again**.
2. ✅ "Already registered for this event." (not a crash, not a double-count).

### Step 5: Early/late scan (time window)
1. Make an event whose `end` is in the past.
2. Scan it.
3. ✅ "Event has already ended."

### Step 6: Verify in Supabase
1. **Table Editor → `attendance`**: ✅ your `student_id` + `event_id` row exists.
2. **Table Editor → `events`**: ✅ the event row exists (created if it wasn't there).

### Step 7: Teacher still sees it
1. Log in as the **Teacher** who made the event.
2. History / teacher view: ✅ the attendee count for that event increased.

### Step 8: History still works (Student)
1. Log in as the Student.
2. History tab: ✅ your scan appears with the event title.

---

## 8. LAB CHECKLIST (Tick these off)

| # | Task | Done? |
|---|---|---|
| 1 | `npx tsc --noEmit` passes | ☐ |
| 2 | `registerAttendance` + `getAttendanceHistory` are in `lib/attendance.ts` | ☐ |
| 3 | Scanner uses `getEventByCode` (shared lookup) | ☐ |
| 4 | `lib/database.ts` deleted | ☐ |
| 5 | `scan.tsx` and `history.tsx` import from `lib/attendance` | ☐ |
| 6 | First scan → "Attendance recorded!" | ☐ |
| 7 | Duplicate scan → "Already registered" (no double count) | ☐ |
| 8 | Early/late scan → time-window message | ☐ |
| 9 | Attendance row appears in Supabase | ☐ |
| 10 | Teacher's attendee count + Student's history reflect the scan | ☐ |

---

## 9. CHECK YOUR UNDERSTANDING (Quiz)

1. Why move ALL attendance into `lib/attendance.ts` instead of leaving some in `lib/database.ts`?
2. What does `getEventByCode` do, and why is reusing it better than hand-writing the query?
3. Where does the scanner put an event that doesn't exist yet?
4. What database error code signals a duplicate scan, and what do we reply?
5. What data does an `attendance` row store that links it to a cloud event?
6. What is the difference between the time-window check and the duplicate check?

*(Answers at the bottom — try them first!)*

---

## 10. COMMON ERRORS

### Error: Module not found: `'@/lib/database'`
**Cause:** `lib/database.ts` was deleted but a screen still imports from it.
**Fix:** Update the import to `@/lib/attendance`.

### Error: Scan says "Could not check event."
**Cause:** `getEventByCode` hit a DB error (often RLS).
**Fix:** Verify the `events` RLS policies (Phase 3) allow the student's role to `SELECT` events. Also confirm you're logged in.

### Error: Second scan inserts a duplicate row
**Cause:** The unique constraint on `attendance(student_id, event_id)` may be missing.
**Fix:** Re-run the Phase 3 schema, which defines the unique constraint. Without it, code `23505` won't fire.

### Error: Teacher's count is 0 even after a scan
**Cause:** The scanned event's `created_by` isn't the teacher, OR the event was auto-created without a `created_by`.
**Fix:** For teacher views, create the event from the Teacher account so `created_by` is set (Phase 7).

---

## 11. WHAT YOU SHOULD HAVE NOW

✅ All attendance in one service: `lib/attendance.ts`
✅ Scanner registers against **cloud events** via shared `getEventByCode`
✅ Cloud-backed find-or-create for events
✅ Duplicate + time-window handling intact
✅ **`lib/database.ts` deleted** — the old all-in-one file is gone

**Scanning is now fully cloud-backed and centralized.** 🎉

---

## CHECK YOUR UNDERSTANDING — ANSWERS

1. To keep **every** attendance operation (student + teacher) in a single, obvious place. A split between `database.ts` and `attendance.ts` made it easy to miss or duplicate logic.
2. It looks up one event by its `event_code` in the cloud. Reusing it removes a duplicated query and gives us a single source of truth for "find an event by code".
3. It creates it: inserts a row into the cloud `events` table (with `event_code`, `title`, `start_time`, `end_time`).
4. `23505` (PostgreSQL unique-constraint violation). We reply "Already registered for this event."
5. `student_id` (who scanned) and `event_id` (which event) — `event_id` is the foreign key linking back to the `events` table.
6. The time-window check prevents scanning *before* start or *after* end; the duplicate check prevents the *same student* registering for the *same event* twice.

---

*Migration Phase 9 completed 2026-09-03.*
