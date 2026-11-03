# Migration Phase 10 — Attendance History & Teacher Summary (Final Cloud Queries)

> This is a **student lab activity**. This is migration **Phase 10**. In this phase we **finalize the read queries** used to show attendance: the **student history** listing and the **teacher event summary** with per-event counts. We make the summary query **efficient** so it doesn't download every attendee just to count them.

---

## HOW TO USE THIS DOCUMENT (Read Me First)

In this phase you will:
1. **LEARN** — the two read-query patterns (one-row-per-attendance vs count-only) and when to use each
2. **CODE** — an efficient `getTeacherEventSummary` that counts without downloading attendee lists
3. **VERIFY** — typecheck + build-and-view both the student and teacher history

**Time needed:** ~30 minutes
**You will need:** Phases 4-9 (Supabase data layer, attendance service).

---

## 1. WHAT ARE WE DOING AND WHY?

### The Situation

`lib/attendance.ts` already provides read queries:
- `getAttendanceHistory(studentId)` — a Student's list of scans (joined with event titles).
- `getTeacherEventAttendance(teacherId)` — a Teacher's events **with full attendee lists** (used to render names/IDs in the History tab).
- `getTeacherEventSummary(teacherId)` — a Teacher's events **with just counts**.

The problem: `getTeacherEventSummary` was implemented by **reusing** `getTeacherEventAttendance` and throwing away the attendee lists. For a teacher with big events, that downloads every attendee row **just to count them** — slow and wasteful.

### The Goal

Redesign `getTeacherEventSummary` to fetch **only what it needs**: the event rows, plus a lightweight list of `event_id`s from `attendance` that it counts in memory.

### The Analogy: Headcount vs. Roll Call

- A **roll call** (`attendance` with full attendee lists) tells you *who* is here — you need every name.
- A **headcount** (summary) only needs *how many* — you don't need every name.

If a school only wants a headcount for each class, it shouldn't make the office read out every student's name in full. It just counts. Phase 10 teaches the app to **use the cheapest query for the job**.

---

## 2. THE TWO READ PATTERNS

### Pattern A — "Full detail" (`getTeacherEventAttendance`)

Used when you must **render the actual attendees** (names/IDs in the UI).

```typescript
const { data: attendance } = await supabase
  .from('attendance')
  .select('student_id, scanned_at, event_id')
  .in('event_id', eventIds);
```

Returns every attendance row → the UI can show a scrollable list of who attended.

### Pattern B — "Count only" (`getTeacherEventSummary`)

Used when you only need the **number** of attendees per event.

```typescript
const { data: attRows } = await supabase
  .from('attendance')
  .select('event_id')                    // just the event id — nothing else
  .in('event_id', eventIds);
```

Downloads only the `event_id` column for each row — **much lighter** — then we count per event in JavaScript.

> 💡 Same table, same rows, but Pattern B transfers far less data because it asks for only one column.

---

## 3. THE EFFICIENT SUMMARY (line by line)

```typescript
export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  // 1. Get the teacher's events (id + code + title)
  const events = await supabase
    .from('events')
    .select('id, event_code, title')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  const eventIds = events.map((e) => e.id);
  if (eventIds.length === 0) return [];   // 2. no events → []

  // 3. Lightweight count fetch: only event_id per attendance row
  const attRows = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);

  // 4. Count how many rows point at each event
  const counts: Record<string, number> = {};
  attRows.forEach((r) => {
    counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
  });

  // 5. Build the summary list
  return events.map((e) => ({
    eventId: e.id,
    eventCode: e.event_code,
    title: e.title,
    attendeeCount: counts[e.id] ?? 0,
  }));
}
```

| Step | Meaning |
|---|---|
| 1 | Query the teacher's events (already filtered by `created_by` → RLS-friendly). |
| 2 | Empty guard — no events, nothing to count. |
| 3 | Fetch **only** `event_id` from `attendance` for those events. |
| 4 | `counts[event_id]` uses a dictionary; `?? 0` handles the first occurrence. |
| 5 | Map each event to its `{ ... , attendeeCount }`. Events with zero scans get `0`, not `undefined`. |

---

## 4. BEFORE vs AFTER — SIDE BY SIDE

| Aspect | BEFORE (Phase 6/9) | AFTER (Phase 10) |
|---|---|---|
| `getTeacherEventSummary` impl | reuses `getTeacherEventAttendance` (full attendee lists) | own lightweight `event_id` count query |
| Data transferred | all `student_id, scanned_at, event_id` rows | only `event_id` column |
| Count correctness | ✅ | ✅ (same result) |
| Efficiency for large events | ❌ slow | ✅ fast |
| `getTeacherEventAttendance` | unchanged (needs full lists for UI) | unchanged |
| `getAttendanceHistory` | unchanged (single join query) | unchanged |

---

## 5. WHICH QUERY SHOULD YOU USE?

| Need | Use |
|---|---|
| Render WHO attended (history tab showing names) | `getTeacherEventAttendance` |
| Show only "how many attended" (badges, dashboards) | `getTeacherEventSummary` |

> 💡 Rule of thumb: **only fetch the columns you display.** If the UI never shows a student's name, don't download it just to count.

---

## 5.5. STEP-BY-STEP EXECUTION GUIDE (what to type, in order)

> This turns Sections 2–3 into a "do it now" checklist. Edit the file in one place.

### Step 1 — Open `lib/attendance.ts` and update `getTeacherEventSummary`
Find `getTeacherEventSummary(teacherId)` (from Phase 6). Replace its implementation:

1. **Query the teacher's events** (keep as is): `.from('events').select('id, event_code, title').eq('created_by', teacherId).order('created_at', { ascending: false })`.
2. **Empty guard**: `if (eventIds.length === 0) return [];`.
3. **Lightweight count fetch** (new):
   ```typescript
   const { data: attRows, error: attError } = await supabase
     .from('attendance')
     .select('event_id')
     .in('event_id', eventIds);
   ```
4. **Count in JavaScript**:
   ```typescript
   const counts: Record<string, number> = {};
   attRows.forEach((r) => { counts[r.event_id] = (counts[r.event_id] ?? 0) + 1; });
   ```
5. **Map events → summaries** with `attendeeCount: counts[e.id] ?? 0`.

> ⚠️ Do **not** call `getTeacherEventAttendance` from the summary — that's the whole point (it downloads every attendee).

### Step 2 — Do NOT change `getTeacherEventAttendance` or `getAttendanceHistory`
They already return the full data the UI needs. Leave them as-is.

### Step 3 — Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors. The result shape (`TeacherEventSummary[]`) is unchanged, so the History tab compiles without edits.

### Step 4 — Run & test (Section 6)
```bash
npx expo start
```
Complete Section 6 (seed events/scans → student history shows scans → teacher badges show counts → full attendee list still renders).

### Step 5 — Tick off Section 7's checklist
Don't continue until all boxes are checked.

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

### Step 3: Seed some data so counts are visible
1. As a **Teacher**, create 2-3 events.
2. As a **Student**, scan into each event (some events twice → only count once, thanks to Unique).

### Step 4: Student history
1. Log in as the **Student**.
2. History tab: ✅ each scan appears with its event title, newest first.

### Step 5: Teacher view
1. Log in as the **Teacher**.
2. History tab: ✅ each event shows its **attendee count** badge.
3. Expand/tap any event: ✅ the full **attendee list** still renders (this uses `getTeacherEventAttendance`).

### Step 6: Verify counts in Supabase
1. **Table Editor → `attendance`**: ✅ count the rows per `event_id` and confirm they match the badges.

### Step 7: (Optional speed check)
1. Log in as a Teacher with several fully-attended events.
2. Compare how quickly the History tab's badges appear vs. opening an event's full attendee list.
3. ✅ The summary (badges) is lighter/faster because it transfers less data.

---

## 7. LAB CHECKLIST (Tick these off)

| # | Task | Done? |
|---|---|---|
| 1 | `npx tsc --noEmit` passes | ☐ |
| 2 | `getTeacherEventSummary` queries only `event_id` column | ☐ |
| 3 | Summary no longer calls `getTeacherEventAttendance` | ☐ |
| 4 | Events with zero scans show count `0` (not `undefined`) | ☐ |
| 5 | Student history shows scans + titles, newest first | ☐ |
| 6 | Teacher badges show correct counts | ☐ |
| 7 | Teacher full attendee list still renders | ☐ |
| 8 | Counts in UI match Supabase `attendance` rows | ☐ |
| 9 | I can explain why count-only queries are lighter | ☐ |
| 10 | I can choose between `getTeacherEventAttendance` and `getTeacherEventSummary` | ☐ |

---

## 8. CHECK YOUR UNDERSTANDING (Quiz)

1. Why was the old `getTeacherEventSummary` wasteful?
2. Which column does the new summary fetch from `attendance`, and why just that one?
3. What does `counts[e.id] ?? 0` do, and why is it needed?
4. When should you use `getTeacherEventAttendance` instead of `getTeacherEventSummary`?
5. What's the general rule for choosing query columns?
6. Does making the summary lighter change the attendee-count *result*? Why not?

*(Answers at the bottom — try them first!)*

---

## 9. COMMON ERRORS

### Error: Summary shows `undefined` instead of a number
**Cause:** `counts[e.id]` is `undefined` for events with no scans and you didn't use `?? 0`.
**Fix:** Default to `0` (`counts[e.id] ?? 0`).

### Error: Counts don't match Supabase
**Cause:** Adding the same `student_id` twice for one event — but the Unique constraint prevents that, so each `attendance` row is one distinct attendance.
**Fix:** Confirm the Unique `(student_id, event_id)` constraint exists (Phase 3 schema) — otherwise a "duplicate reset" bug inflates counts.

### Error: Payment of the summary is still slow on huge datasets
**Cause:** With thousands of rows, even one `event_id` per row is heavy.
**Fix:** This is a case for a database **aggregate** (a Postgres function / RPC doing `GROUP BY`). A nice future extension, but out of scope for this phase.

---

## 10. WHAT YOU SHOULD HAVE NOW

✅ Finalized student history query (joined with event titles)
✅ Finalized teacher full-attendance query (for renderable lists)
✅ **Efficient** teacher summary (counts without downloading attendee data)
✅ A clear rule: fetch only the columns you actually display

**Reading attendance is now correct, complete, and efficient.** 🎉

---

## 10b. BONUS — Show attendee names

At Phase 6, the teacher view showed the student's **id (a hex UUID)** because the `profiles` RLS policy (`auth.uid() = id`) blocked reading other users' profiles. This was resolved here:

1. **Schema (`supabase/schema.sql`)** — added `"Teachers can view profiles of their attendees"`, so a teacher can read the `profiles` of students who attended their events:
   ```sql
   exists (
     select 1 from public.attendance a
     join public.events e on e.id = a.event_id
     where a.student_id = profiles.id and e.created_by = auth.uid()
   )
   ```
2. **Query (`lib/attendance.ts`)** — `getTeacherEventAttendance` now selects `profiles ( full_name, email )` via the foreign key from `attendance.student_id → profiles.id`, and each attendee object now includes `studentName`.
3. **UI (`app/(tabs)/history.tsx`)** — renders `studentName`, falling back to the short id (`…last8`) when a student has no name set.

> ⚠️ **You must re-run the schema** for the new RLS policy to take effect: open the Supabase SQL Editor, paste `supabase/schema.sql`, Run. Then re-test the teacher History view.

---

## CHECK YOUR UNDERSTANDING — ANSWERS

1. It reused `getTeacherEventAttendance`, which downloads every attendee row (student_id, scanned_at) just to throw them away and count them.
2. `event_id` — because that single column is all the summary needs to count how many attendance rows belong to each event.
3. It returns `0` for an event with no attendance instead of `undefined` — so the badge always shows a number.
4. When the UI needs to **display the actual attendees** (names/IDs), not just a count.
5. Fetch only the columns you actually display; use the cheapest query that satisfies the screen.
6. No. Counting requires only the `event_id` column, not the full rows, so the result is identical while transferring far less data.

---

*Migration Phase 10 completed 2026-09-03.*
