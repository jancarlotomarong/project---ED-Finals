# Phase 6 — Attendance by Role (Teacher View)

> This is a **student lab activity**. Until now, the History tab only showed a **student's own** attendance. In Phase 5 you added roles (Student vs Teacher). Now we make the **History tab role-aware**: a Student sees their own history; a Teacher sees attendance for the events **they created**.

---

## HOW TO USE THIS DOCUMENT (Read Me First)

In this phase you will:
1. **LEARN** — what "role-aware" means and how teachers become distinct
2. **CODE** — a new `lib/attendance.ts` service + a role-aware History screen
3. **VERIFY** — typecheck + test with a Teacher account and a Student account

**Time needed:** ~30 minutes
**You will need:** Phases 4-5 (Supabase data layer + roles) and the `events`/`attendance` tables from Phase 3.

---

## 1. WHAT ARE WE DOING AND WHY?

### The Problem

So far, the **History tab always shows "my attendance"** — the student's own scans. But remember the Phase 3 RLS policy:

> **"Teachers can view attendance for their events"** — a Teacher can read the attendance rows for any event where `created_by` equals their own user id.

That policy already exists in the database, but **nothing in the app uses it yet!** The Teacher has no way to see how many students attended their event, or who scanned the QR.

### The Goal

Make the History tab **role-aware**:
- **Student** → sees their **own** attendance history (what we built in Phase 4).
- **Teacher** → sees **their events** and the **attendance** recorded for each (count + list of students who scanned).

### The Analogy: Your Own Sheet vs. The Class Register

- A **Student** history is like *your own medical record* — only you see it.
- A **Teacher** history is like *a class attendance register* — the teacher sees, for each activity they ran, who showed up.

Both read the SAME `attendance` table. The difference is **who the query is scoped to** and **which RLS policy applies**.

---

## 2. THE PLAN — TWO CODE CHANGES

| # | File | What changes |
|---|---|---|
| 1 | `lib/attendance.ts` (**new**) | `getTeacherEventAttendance(teacherId)` — fetches a teacher's events + their attendance |
| 2 | `app/(tabs)/history.tsx` | Reads the profile `role`; branches between Student history and Teacher event list |

---

## 3. NEW FILE: `lib/attendance.ts`

### 3a. The types

```typescript
export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  attendeeCount: number;
  attendees: {
    studentId: string;
    scannedAt: string;
  }[];
};
```

| Field | Meaning |
|---|---|
| `eventId` | The event's uuid (used as the list key). |
| `eventCode` | The public code (e.g. `EVT-2026-0002`). |
| `title` | The event name (shown as the card heading). |
| `startTime` / `endTime` | When the event is scheduled. |
| `attendeeCount` | How many students scanned. |
| `attendees` | The list of student ids + their scan times. |

> 💡 **Note on attendee names (historical):** At Phase 6, because of the RLS policy, a Teacher could read a student's `attendance` rows but **not** other users' `profiles` (names). So the list originally showed the **student's id** and **scan time**, not their name. A follow-up in the Phase 10 material added an RLS policy + a `profiles` join so the History tab now shows **names** (see Section 10).

### 3b. Step 1 — Fetch the teacher's events

```typescript
export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) return [];

  const eventIds = events.map((e: any) => e.id);
  if (eventIds.length === 0) return [];
```

| Line | Meaning |
|---|---|
| `.from('events')` | The events table. |
| `.eq('created_by', teacherId)` | **Only events this teacher created.** (RLS already enforces `auth.uid()` here, but we scope explicitly to be safe.) |
| `.order('created_at', ascending false)` | Newest first. |
| `if (events.length === 0) return []` | No events → nothing to show. |

### 3c. Step 2 — Fetch attendance for those events

```typescript
  const { data: attendance, error: attError } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, event_id')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });
```

| Line | Meaning |
|---|---|
| `.from('attendance')` | The attendance table. |
| `.select('student_id, scanned_at, event_id')` | We only need these three fields. |
| `.in('event_id', eventIds)` | Fetch attendance for ALL of the teacher's events at once (one query). |
| **RLS** | This query returns only rows the teacher is allowed to see (their events' attendance). |

### 3d. Step 3 — Group the attendance by event

```typescript
  return events.map((e: any) => {
    const rows = attendance.filter((a: any) => a.event_id === e.id);
    return {
      eventId: e.id,
      eventCode: e.event_code,
      title: e.title,
      startTime: e.start_time,
      endTime: e.end_time,
      attendeeCount: rows.length,
      attendees: rows.map((a: any) => ({
        studentId: a.student_id,
        scannedAt: a.scanned_at,
      })),
    };
  });
}
```

| Piece | Meaning |
|---|---|
| `events.map(...)` | For each event the teacher created... |
| `attendance.filter((a) => a.event_id === e.id)` | ...grab only the rows belonging to THAT event. |
| `attendeeCount: rows.length` | How many students attended. |
| `attendees: rows.map(...)` | Turn each row into `{ studentId, scannedAt }`. |

> 💡 **This grouping-on-the-client approach** (fetch all, filter per event) is simple and uses just **two** Supabase queries. For large datasets you'd JOIN in SQL, but for a school this is perfect.

---

## 4. CHANGE `app/(tabs)/history.tsx` — ROLE-AWARE HISTORY

### 4a. New state

```typescript
const [role, setRole] = useState<Role | null>(null);
const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
```

| State | Meaning |
|---|---|
| `role` | The logged-in user's role, read from `profiles`. |
| `studentRecords` | Attendance history (used when the user is a Student). |
| `teacherEvents` | Event + attendance list (used when the user is a Teacher). |

### 4b. Load role, then branch

```typescript
const load = useCallback(async () => {
  if (!user) { setLoading(false); return; }

  const profile = await getProfile(user.id);
  const currentRole = profile?.role ?? 'student';
  setRole(currentRole);

  if (currentRole === 'teacher') {
    const events = await getTeacherEventAttendance(user.id);
    setTeacherEvents(events);
    setStudentRecords([]);
  } else {
    const records = await getAttendanceHistory(user.id);
    setStudentRecords(records);
    setTeacherEvents([]);
  }

  setLoading(false);
}, [user]);
```

| Branch | Meaning |
|---|---|
| `getProfile(user.id)` | Read the user's `role` from `profiles` (Phase 5). |
| `if (currentRole === 'teacher')` | Load **teacher** event attendance. |
| `else` | Load **student** history (same as Phase 4). |

### 4c. Render based on role

```jsx
if (role === 'teacher') {
  return ( /* list of the teacher's events with attendance */ );
}
return ( /* the original student history list */ );
```

- **Teacher:** a list of `teacherEvents` cards. Each card shows the event title, a **green count badge** (attendee count), the event code, start time, then a **list of students** (`shortId(id)` + scan time).
- **Student:** the exact same list we had in Phase 4 (title, code, time).

> 💡 **"Role-aware UI"** just means: the same screen shows *different data* depending on the logged-in user's role — read once from `profiles`.

### 4d. Helper: `shortId`

```typescript
function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'unknown';
}
```

Shows the **last 8 characters** of the student's uuid so the row stays compact on a phone. (Full uuids are too wide for a hallway glance.)

---

## 5. BEFORE vs AFTER — SIDE BY SIDE

| Aspect | BEFORE (Phase 5) | AFTER (Phase 6) |
|---|---|---|
| History tab | Student's own attendance only | Role-aware |
| Student view | Own history | Own history (unchanged) |
| Teacher view | nothing (no way to see attendance) | Their events + attendance count & student list |
| Service | `lib/database.ts` only | + `lib/attendance.ts` |
| RLS used | student-self policies | + "Teachers can view attendance for their events" |

---

## 5.5. STEP-BY-STEP EXECUTION GUIDE (what to type, in order)

> This turns Sections 3–4 into a "do it now" checklist. Edit the files in this order.

### Step 1 — Create `lib/attendance.ts` (NEW file, Section 3)
Create `lib/attendance.ts` with:
- Types `TeacherEventAttendance` (event + `attendees: { studentId, scannedAt }[]`) and `TeacherEventSummary`.
- `getTeacherEventAttendance(teacherId)` — two queries:
  1. `events .select('id, event_code, title, start_time, end_time').eq('created_by', teacherId)`.
  2. `attendance .select('student_id, scanned_at, event_id').in('event_id', eventIds)`.
  Then group the attendance rows by event on the client (Section 3).
- `getTeacherEventSummary(teacherId)` — maps `getTeacherEventAttendance` down to just `{ eventId, eventCode, title, attendeeCount }`.

### Step 2 — Edit `app/(tabs)/history.tsx` (Section 4)
- Import `getTeacherEventAttendance` from `@/lib/attendance`, plus `getProfile` and `useFocusEffect`.
- In the load callback, read the profile: `const role = (await getProfile(user.id))?.role ?? 'student'`.
- Branch: if `teacher`, call `getTeacherEventAttendance(user.id)` and show the event cards; otherwise keep `getAttendanceHistory` (student view).

### Step 3 — Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors.

### Step 4 — Run & test (Section 6)
```bash
npx expo start
```
Complete Section 6's steps (set up data → teacher view shows events + counts → student view unchanged).

### Step 5 — Tick off Section 7's checklist
Don't continue until all boxes are checked. (The "show student names" item is a later enhancement — Section 10.)

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

### Step 3: Set up data
1. Log in as a **Teacher** account (from Phase 5).
2. Go to the **Teacher** tab and create 1-2 events with the QR codes.
3. Log out, log in as a **Student**, scan the QR(s) so some attendance rows exist.

### Step 4: Check the Teacher view
1. Log back in as the **Teacher**.
2. Open the **History** tab.
3. ✅ You see your event(s) with a **count badge** and the list of students who scanned.

### Step 5: Verify in Supabase
1. Open **Supabase Table Editor** → `attendance`.
2. ✅ Each scan row's `event_id` points to an event your Teacher account created.

### Step 6: Check the Student view (unchanged)
1. Log in as the **Student**.
2. Open the **History** tab.
3. ✅ Still shows the student's own attendance (Phase 4 behaviour intact).

---

## 7. LAB CHECKLIST (Tick these off)

| # | Task | Done? |
|---|---|---|
| 1 | `npx tsc --noEmit` passes | ☐ |
| 2 | `lib/attendance.ts` created | ☐ |
| 3 | Teacher History tab shows their events | ☐ |
| 4 | Each event card shows an attendee count | ☐ |
| 5 | Each event card lists students (ids + times) | ☐ |
| 6 | A teacher with no events sees a helpful empty message | ☐ |
| 7 | Student History tab still works as before | ☐ |
| 8 | `attendance` rows in Supabase link to the teacher's events | ☐ |
| 9 | I can explain the RLS policy that lets this work | ☐ |
| 10 | I can explain why student NAMES aren't shown yet | ☐ |

---

## 8. CHECK YOUR UNDERSTANDING (Quiz)

1. Which Phase 3 RLS policy powers the Teacher attendance view?
2. Why do we filter events by `.eq('created_by', teacherId)`?
3. Why do we fetch ALL attendance with `.in('event_id', eventIds)` and then group in JavaScript, instead of one query per event?
4. Why can't the Teacher view show student names right now?
5. What makes the History screen "role-aware"?
6. What would you change to also show each student's name?

*(Answers at the bottom — try them first!)*

---

## 9. COMMON ERRORS

### Error: Teacher sees NO events / empty even when events exist
**Cause:** The events were created while logged into a **different** account, so `created_by` doesn't match this teacher.
**Fix:** Make sure the Teacher viewing History is the SAME account that created the events in the Teacher tab.

### Error: `permission denied` or empty attendance for the teacher
**Cause:** The RLS policy "Teachers can view attendance for their events" checks `created_by = auth.uid()`. If `events.created_by` is null (created without being logged in), it won't match.
**Fix:** Create events while logged in so `created_by` is set.

### Error: Student view shows nothing
**Cause:** The student hasn't scanned any QR codes, OR the profile role was misread.
**Fix:** Scan a QR first. If it's a role problem, check `profiles.role` in Supabase.

---

## 10. GOING FURTHER: Showing student names

> ✅ **UPDATE (Phase 10 follow-up):** This optional enhancement is now **implemented**. A `"Teachers can view profiles of their attendees"` RLS policy was added to `supabase/schema.sql`, `getTeacherEventAttendance` joins `attendance → profiles` to read `full_name`, and the History tab now shows each attendee's name (falling back to the short id when no name is set). The policy below is what was added.

Right now we show student **ids** only. To show **names**, you'd need a new RLS policy on `profiles` that lets a teacher read the profiles of users who attended their events, for example:

```sql
create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  using (
    exists (
      select 1 from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );
```

To see the original limitation before this change, see the note at the top of this document under "Note on attendee names" (Section 3). To see the full implementation, refer to the Phase 10 material in `docs/migration-log.md`.

---

## 11. WHAT YOU SHOULD HAVE NOW

✅ A new `lib/attendance.ts` service
✅ History tab is **role-aware** — Teacher sees their events + attendance
✅ Student history behavior is unchanged
✅ Two clean Supabase queries power the teacher view
✅ The un-used Phase 3 RLS policy is finally doing real work

**The Teacher is no longer blind — they can see attendance for their events.** 🎉

---

## CHECK YOUR UNDERSTANDING — ANSWERS

1. **"Teachers can view attendance for their events"** — `using (exists (select 1 from events e where e.id = attendance.event_id and e.created_by = auth.uid()))`.
2. To fetch only the events that this teacher owns, so we don't load (and the RLS doesn't expose) other people's events.
3. To avoid N+1 queries (one round-trip per event). Fetch all once, then filter in JS — 2 queries total, which is efficient for a school's data size.
4. Because the `profiles` RLS policy `auth.uid() = id` lets users read **only their own** profile, so a teacher can't SELECT other students' `full_name`/`email`.
5. It reads the user's `role` from `profiles` and renders a **different dataset** (student history vs teacher event list) based on it.
6. Add a new RLS policy allowing teachers to read the profiles of students who attended their events (see Section 10).

---

*Phase 6 completed 2026-09-03.*
