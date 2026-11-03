# 12 — Final Project (Part I) Notes

Everything you need to **set up**, **demo** and **defend** the Individual Final Project.
Scope: **Part I only** (individual QR-ATT). Nothing from the Hackathon list (rotating QR,
late detection, offline mode, analytics, notifications…) was added on purpose.

---

## 1. Setup (do this once)

1. Supabase Dashboard → **SQL Editor** → run `schema.sql` (already done in the midterm), then run
   **`schema_final_project.sql`** (new, safe to re-run).
2. Keep your own `.env` (copy from `.env.example`). Never commit it. Only the *publishable/anon*
   key belongs in the app — **never** a `service_role` / `sb_secret_` key.
3. `npm install` then `npx expo start -c` (the `-c` regenerates the typed routes for the new screens).
4. Create the first admin: register a normal account, then in the SQL editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'your-admin@email.com';
   ```
5. Supabase → Authentication → Providers → Email: for classroom demos you may turn **"Confirm email" off**
   so new accounts get a session immediately.
6. Delete the old `app/(tabs)/teacher.tsx` if it still exists in your folder (it was replaced by `events.tsx`).

---

## 2. Requirement checklist (PDF section → where it lives)

| Requirement | Status | Where |
|---|---|---|
| Roles: Student / Teacher / **Administrator** | ✅ | `profiles.role` (`student`,`teacher`,`admin`), `app/(tabs)/_layout.tsx` |
| Registration / Login / Logout / Session | ✅ | `app/register.tsx`, `app/login.tsx`, `lib/auth.ts`, `lib/supabase.ts` |
| Password protection | ✅ | Supabase Auth (bcrypt hashing); client rule 8+ chars, letter + number (`lib/validation.ts`) |
| Student / Teacher / Admin profile | ✅ | `app/(tabs)/profile.tsx`, `lib/profiles.ts` |
| Role-based access | ✅ | Tabs per role (UI) **+ RLS policies (real enforcement)** |
| Event: create / edit / view / close | ✅ | `app/event-form.tsx`, `app/event/[id].tsx`, `lib/events.ts` |
| Event fields: name, date, time, venue, description, status | ✅ | `events` table (`title`, `start_time`, `end_time`, `venue`, `description`, `status`) |
| Generate QR for event | ✅ | `app/event/[id].tsx` (react-native-qrcode-svg) |
| Student scans QR → validated → recorded → confirmation | ✅ | `app/(tabs)/scan.tsx` → `record_attendance()` SQL function |
| Prevent duplicate / closed / invalid QR / unauthorized | ✅ | `record_attendance()` + `UNIQUE(student_id,event_id)` |
| Attendance record: student, event, date, time, status | ✅ | `attendance` table (`scanned_at` = date+time, `status`) |
| Student attendance history | ✅ | `app/(tabs)/history.tsx` (student view) |
| Teacher: view/monitor/summary | ✅ | `app/event/[id].tsx` (live list + summary), `history.tsx` (staff view) |
| Admin: manage users | ✅ | `app/(tabs)/users.tsx` (role, activate/deactivate, search) |
| Admin: manage events / correct attendance | ✅ | edit/close/delete event; `history.tsx` correction modal |
| Admin: overall attendance + reports | ✅ | Dashboard (`index.tsx` → `get_system_report()`), `history.tsx` |
| Database: Users, Profiles, Events, Attendance + relationships | ✅ | see §4 |
| Security list (RLS, validation, session, logout…) | ✅ | see §5 |
| UI feedback: loading, success, error, empty, invalid QR, duplicate, unauthorized, closed | ✅ | `components/StateViews.tsx`, `scan.tsx` result cards |
| ≥ 5 events explained | ✅ (12 listed) | §3 |

---

## 3. Event-driven programming — Event → Handler → Action → Result

| # | Event | Handler (file) | Action | Result |
|---|---|---|---|---|
| 1 | User presses **Sign In** | `handleLogin` (`login.tsx`) | validate → `signIn()` → Supabase `signInWithPassword` → load profile | Route guard sends user to the role's tabs; or error text |
| 2 | **App starts** | `initAuth()` in `_layout.tsx` effect | `getSession()` restores the secure session | Logged-in user skips login |
| 3 | **Auth state changes** (sign in/out/refresh) | `onAuthStateChange` → `applySession` (`lib/auth.ts`) | reload profile/role; sign out deactivated users | Every screen using `useAuth()` re-renders |
| 4 | User presses **Sign Up** | `handleRegister` (`register.tsx`) | validate → `signUp()` with role metadata → DB trigger `handle_new_user` creates profile | Account + profile created |
| 5 | **Teacher saves event** | `handleSave` (`event-form.tsx`) | `validateEventInput` → `createEvent` (INSERT, RLS: staff only) | QR is generated on event page |
| 6 | **Scanner detects a QR** | `handleBarcodeScanned` (`scan.tsx`) | `registerAttendance` → `rpc('record_attendance')` | Success / duplicate / closed / invalid card |
| 7 | **Invalid QR** detected | `parseQRPayload` (client) or `record_attendance` (server) | return code `invalid_qr` | Red "Invalid QR code" card |
| 8 | **Duplicate** attendance detected | `unique_violation` handler in `record_attendance` | return code `duplicate` | Yellow "Already recorded" card |
| 9 | **Event status changes** (Close / Reopen) | `handleToggleStatus` (`event/[id].tsx`) | confirm → `setEventStatus` (UPDATE) | Badge changes; further scans return `closed` |
| 10 | **DB row inserted** (a student scanned) | Realtime channel `postgres_changes` (`event/[id].tsx`) | debounce → `reload()` | Teacher's attendee list updates instantly |
| 11 | **Pull-to-refresh / screen focus** | `useLoader` (`lib/useLoader.ts`) | re-run the fetcher | Fresh data, loading/empty/error states |
| 12 | User presses **Sign Out** | `handleSignOut` (`profile.tsx`) | confirm → `signOut()` clears secure storage + state | Redirected to login |
| 13 | Admin presses **Save** on a user | `handleSave` (`users.tsx`) | `updateUser` (UPDATE profiles, RLS: admin only; trigger blocks self-change) | Role / active status changes |
| 14 | Admin presses **Save correction** | `handleSave` (`history.tsx` modal) | `updateAttendance` (UPDATE, RLS: admin only) | Status/remarks changed |

---

## 4. Database

```
auth.users (Supabase Auth: email + hashed password)
   │ 1 ── 1
   ▼
profiles ───────────── id (PK, FK → auth.users)  email  full_name  role  student_number
   │                    program  section  department  is_active  created_at  updated_at
   │ 1 ── many (created_by)
   ▼
events ──────────────── id (PK)  event_code (UNIQUE)  title  description  venue
   │                    start_time  end_time  status('open'|'closed')  created_by (FK)
   │ 1 ── many
   ▼
attendance ──────────── id (PK)  student_id (FK → auth.users AND profiles)  event_id (FK → events)
                        scanned_at  status('present'|'late'|'absent'|'excused')  remarks
                        UNIQUE(student_id, event_id)   ← duplicate prevention
```

* **One-to-one:** `auth.users` ↔ `profiles` (created by trigger on sign-up).
* **One-to-many:** a teacher/admin (`profiles`) → many `events`; an `event` → many `attendance`; a student → many `attendance`.
* **Many-to-many (resolved):** students ↔ events through the `attendance` table.
* `ON DELETE CASCADE` on attendance → deleting an event/user removes its records.

SQL functions (all `SECURITY DEFINER`, `search_path` pinned, `EXECUTE` only for signed-in users):
`current_user_role()`, `is_admin()`, `is_staff()`, `record_attendance(code)`,
`count_active_students()`, `get_system_report()`.

---

## 5. Authentication, authorization & security

**Authentication** — Supabase Auth. Session is stored in **expo-secure-store** (Keychain/Keystore, chunked)
and restored on start; token refresh only runs while the app is in the foreground.

**Authorization matrix (enforced by RLS in the database, not just hidden buttons)**

| Table | Student | Teacher | Admin |
|---|---|---|---|
| profiles | read/update **own** (not role/status) | read own + attendees of own events | read/update **all** |
| events | read | read; insert/update **own** | read/insert/update/**delete** all |
| attendance | read **own**; insert only via `record_attendance()` | read for **own events** | read/**update/delete** all |

**Security measures**

1. **No client trust:** the QR only contains the event code; role, open/closed, time window and duplicates
   are all checked inside `record_attendance()`. A modified app or forged QR cannot cheat.
2. **No direct INSERT** on `attendance` for students (policy removed) and none on `events` for students.
3. **Privilege-escalation fix:** the midterm policy let any user `UPDATE` their own `role`.
   Trigger `protect_profile_columns` now rejects role/status changes unless the caller is an admin
   (admins also cannot change their own role/status → no accidental lock-out).
4. Sign-up can only request `student` or `teacher`; `admin` is granted only by an existing admin / SQL editor.
5. **Deactivated accounts:** `current_user_role()` returns NULL → every policy denies; the app signs them out.
6. **Input validation** on the client (`lib/validation.ts`) **and** DB constraints (`CHECK` on role/status, `events_time_check`).
7. **Secrets:** only the publishable key is in `.env` (git-ignored). No service-role key anywhere.
8. Zero-row updates (blocked by RLS) are detected and shown as "permission" errors instead of silent success.

---

## 6. Suggested demo script (≈ 7 min)

1. **Admin** logs in → Dashboard totals → *Users* (promote a user, deactivate one).
2. **Teacher** logs in → *Create Event* → event page shows **QR + live Attendees**.
3. **Student** logs in → *Events* list → *Scan* the teacher's QR (use two devices or a screenshot on a PC) → green confirmation.
4. Scan again → **duplicate** card. Teacher **closes** the event → scan again → **closed** card. Scan a random QR → **invalid**.
5. Student *History* shows the record; teacher sees the row appear **live** without refreshing.
6. Admin → *Attendance* → open an event → tap a record → change to **Late** + remarks → show it updates.
7. Try a student on a staff-only action → blocked (RLS), show the policy in Supabase.

---

## 7. Questions you may be asked

* **"Where is duplicate attendance prevented?"** — `UNIQUE (student_id, event_id)` plus the `unique_violation` handler in `record_attendance()`.
* **"What stops a student from making themselves a teacher?"** — Trigger `protect_profile_columns` + sign-up trigger only accepts `student`/`teacher`.
* **"Why an RPC instead of a normal insert?"** — So all validation runs on the server in one atomic step.
* **"What is RLS?"** — Row Level Security: Postgres filters rows per user according to policies, so the app cannot read/write what the policy denies even if the client code is changed.
* **"Show a database relationship."** — `attendance.event_id → events.id`, `events.created_by → profiles/auth.users`.
* **"Add a field to events live."** — add a column in SQL, add it to `CloudEvent` + `toRow()` in `lib/events.ts`, and an input in `event-form.tsx`.

---

## 8. Known limitations (be honest in defense; these belong to Part II)

* The QR is **static** — someone could share a photo of it. (Rotating/time-limited QR = Hackathon feature.)
* No offline mode, notifications, late auto-detection or analytics (Hackathon features).
* Teachers can self-register at sign-up; for a real school, restrict teacher sign-up (invite code or admin approval).
