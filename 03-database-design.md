# Phase 3 — Database Design

> This is a **student lab activity**. Work through it step by step. Every section builds on the one before it. By the end you will have created a **real cloud database** that is secure and ready for your app.

---

## HOW TO USE THIS DOCUMENT (Read Me First)

This phase is **hands-on**. You will:
1. **LEARN** — read short explanations (in plain language, with analogies)
2. **DO** — run SQL in your Supabase project
3. **CHECK** — confirm each step worked using the checklists
4. **REVIEW** — answer the "Check Your Understanding" questions at the end

**Time needed:** ~45 minutes
**You will need:** Your Supabase project from Phase 1, and the SQL code in `supabase/schema.sql`

---

## 1. WHAT ARE WE DOING AND WHY?

### The Big Picture

Your app currently stores attendance in a **local file** on your phone (called SQLite). This has 3 big problems:

| Problem | What it means |
|---|---|
| 🗑️ **Data lives on ONE device** | Delete the app → read your attendance history? GONE. |
| 👤 **No real users** | It pretends everyone is `STUDENT-2026-001`. |
| 🔓 **No security** | Anyone using the app could read everyone's data. |

Today, we are going to build a **cloud database** (on Supabase) that fixes all 3 problems.

### The Analogy: A Notebook vs. A Shared Online Document

Think of it this way:

- **SQLite** = a paper notebook you carry in your pocket. Only YOU can see it. Lose the notebook → your notes are gone. Rip out a page → nobody knows.
- **Supabase/PostgreSQL** = a **Google Spreadsheet** shared on the internet. Anyone with an account can see THEIR OWN tab. The owner can add security so strangers can't peek. And it's backed up — you can't lose it.

Today you build the structure of that online spreadsheet — the **tables** (tabs), the **columns** (cells), and the **security rules** (who can see what).

### What You Will Understand By The End

After this phase, you'll be able to answer:
- What is a **table**, a **row**, and a **column**?
- What is a **Primary Key** and why does every table have one?
- What is a **Foreign Key** and how does it connect tables?
- What is a **Unique constraint** and why does it stop duplicate attendance?
- What is **Row Level Security** and why is it essential?
- How does a **trigger** auto-create a profile when someone signs up?

---

## 2. YOUR APP'S DATABASE: BEFORE (SQLite)

Here is the database structure your app uses RIGHT NOW. Don't worry — you don't need to write this. Just READ it and understand the idea.

```sql
-- events table: stores details about each event
CREATE TABLE events (
  eventId TEXT PRIMARY KEY NOT NULL,   -- a unique code for the event
  title   TEXT NOT NULL,               -- the event name
  start   TEXT NOT NULL,               -- start time
  end     TEXT NOT NULL                -- end time
);

-- attendance table: stores one row per student scan
CREATE TABLE attendance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,  -- auto-incrementing number
  studentId   TEXT NOT NULL,                      -- which student (hardcoded!)
  eventId     TEXT NOT NULL,                      -- which event
  scannedAt   TEXT NOT NULL,                      -- when scanned
  UNIQUE (studentId, eventId)                     -- no duplicate scans
);
```

**Spot the problems:**
- There is **no `profiles` table** — we don't even track real users.
- `studentId` is just a text string like `"STUDENT-2026-001"` — not a real account.
- Anyone running the app gets the SAME `studentId`. That's the whole problem.

> ✅ **STOP AND THINK:** In your own words, why is having one `studentId` for everyone a problem? (Write it down before moving on.)

---

## 3. WHAT WE ARE BUILDING: AFTER (Supabase PostgreSQL)

Here is the NEW structure. We are creating **three** tables instead of two. Each one serves a clear purpose.

### The Three Tables At A Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE CLOUD DATABASE                    │
│                                                               │
│   auth.users  (Supabase's built-in list of user accounts)     │
│        │                                                      │
│        │ 1:1 (one profile per user)                          │
│        ▼                                                      │
│   ┌────────────┐    creates ┌──────────────┐                 │
│   │  profiles  │            │    events    │                 │
│   └────────────┘            └──────┬───────┘                 │
│                                    │ 1:N (one event,         │
│                                    │ many attendance rows)   │
│                                    ▼                         │
│                            ┌──────────────┐                 │
│                            │  attendance  │  ← one student   │
│                            └──────────────┘    scans one event│
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

Hold on to this picture. Now we'll explain each piece **line by line**.

---

## 4. TABLE 1: `profiles` — WHO ARE THE USERS?

### Why do we need it?

Phase 2 gave each student a **login** (email + password). Supabase keeps those logins in a special built-in table called `auth.users`. But we also want to store extra info about each person (like whether they're a student or a teacher, or their display name). So we create our OWN table called `profiles` that sits **alongside** `auth.users`.

### Read the SQL line by line

```sql
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Let's decode each line:

| Line | Meaning (plain English) |
|---|---|
| `create table if not exists public.profiles` | Make a table named `profiles` in the `public` schema. `if not exists` = don't error if it's already there (safe to re-run). |
| `id uuid primary key` | `id` is the **Primary Key** — a unique ID for each profile. `uuid` = a huge random ID (like a long fingerprint) that can't collide across devices. `primary key` = unique + required + indexed. |
| `references auth.users (id)` | This is a **Foreign Key** — it says "this profile belongs to ONE user from the auth.users table." |
| `on delete cascade` | If the user account is deleted, delete their profile too (keeps things clean). |
| `email text not null` | Store their email. `text` = text data type. `not null` = this field can't be empty. |
| `full_name text` | Optional display name (no `not null`, so it CAN be empty). |
| `role text not null default 'student'`<br>`check (role in ('student','teacher'))` | `role` is `'student'` by default. The `check` is a rule: it can ONLY be `'student'` or `'teacher'` — anything else is rejected. |
| `created_at timestamptz not null default now()` | When this profile was created. `timestamptz` stores date+time WITH timezone info. `default now()` auto-fills it. |
| `updated_at ...` | When it was last changed. (Convention: every table should track when it was created/updated.) |

> 💡 **KEY CONCEPT — Primary Key:** Every table has a Primary Key column that is *unique* for each row. It's like each person's **national ID number** — no two people share the same one, and it's used to find them.
>
> 💡 **KEY CONCEPT — Foreign Key:** A Foreign Key is a column in one table that points to the Primary Key of another table. It's how tables **connect**. Here, `profiles.id` points to `auth.users.id`.

---

## 5. TABLE 2: `events` — WHAT IS THE EVENT?

### Read the SQL line by line

```sql
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  event_code  text not null unique,
  title       text not null,
  start_time  timestamptz,
  end_time    timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
```

| Line | Meaning (plain English) |
|---|---|
| `id uuid primary key default gen_random_uuid()` | Primary key. `default gen_random_uuid()` means PostgreSQL **generates a random ID automatically** — we don't have to provide one. |
| `event_code text not null unique` | The short code embedded in the QR code. `unique` = no two events can share the same code. |
| `title text not null` | Event name (e.g., "Research Defense"). |
| `start_time timestamptz` | When the event starts. **Note the name change** — we use `start_time` NOT `start`, because `start`/`end` are **reserved words** in PostgreSQL (they have special meaning). |
| `end_time timestamptz` | When the event ends. |
| `created_by uuid references auth.users (id)`<br>`on delete set null` | Who created this event (a teacher's user ID). `on delete set null`: if that teacher's account is deleted, don't delete the event — just blank out `created_by`. |
| `created_at ...` | When the event was created. |

> ⚠️ **CAUTION — Reserved Words:** Words like `start`, `end`, `select`, `from`, `order` are **reserved** in PostgreSQL — they already mean something to the database engine. You cannot use them as column names without special handling. **This caused a real bug earlier** (see Section "Common Errors")! We avoid it by naming them `start_time` / `end_time`.

---

## 6. TABLE 3: `attendance` — WHO SCANNED WHAT?

### Read the SQL line by line

```sql
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references auth.users (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  scanned_at  timestamptz not null default now(),
  unique (student_id, event_id)
);
```

| Line | Meaning (plain English) |
|---|---|
| `id uuid primary key default gen_random_uuid()` | Primary key, auto-generated. |
| `student_id uuid not null references auth.users (id)` | **Which student** scanned. A Foreign Key pointing to the auth user. `not null` = every attendance row MUST have a student. |
| `event_id uuid not null references public.events (id)` | **Which event** they scanned. A Foreign Key pointing to `events`. |
| `scanned_at timestamptz not null default now()` | When the scan happened. Auto-filled with the current time. |
| `unique (student_id, event_id)` | **This is the anti-cheat rule!** A student can only appear ONCE per event. If they scan twice, the SECOND attempt is rejected. |

> 💡 **KEY CONCEPT — Unique Constraint:** `unique (student_id, event_id)` means "the combination of `(student_id, event_id)` must be unique across all rows." This is exactly what stops a student from registering for the same event twice. Remember this — the app will use it to show "Already registered for this event."

---

## 7. HOW THE TABLES CONNECT (Relationships)

Now let's connect the dots. This is called **database relationships**.

```
auth.users ──── 1:1  ──── profiles
     │                 (each user = one profile)
     │ uses
     ▼
events ──── 1:N ──── attendance
(one event)   (many scans)
     ▲
     └── created_by points to a user
```

| Relationship | Type | Meaning |
|---|---|---|
| `profiles.id → auth.users.id` | **1 to 1** | One user has exactly ONE profile. |
| `events.created_by → auth.users.id` | **Many to 1** | A teacher (one user) creates MANY events. |
| `attendance.student_id → auth.users.id` | **Many to 1** | A student has MANY attendance records. |
| `attendance.event_id → events.id` | **Many to 1** | An event has MANY attendance records. |

**Reading a relationship:** "A **student** scans an **event**. That scan is stored in `attendance` as one row linking `student_id` (the who) and `event_id` (the what)."

> ✅ **STOP AND THINK:** If a student wants to see their attendance history, which tables do we need to combine (JOIN)? Write down your guess before Section 11.

---

## 8. ROW LEVEL SECURITY (RLS) — THE SECURITY GUARD

### The danger without it

Remember the `anon` (publishable) API key is used by the app — and it's in your app's code. If someone extracts that key, they could query your database. **Without RLS, they could read EVERY student's attendance.** That's a privacy disaster.

### What RLS does

**Row Level Security** is like a **security guard at the door of every row**. Even if someone has the key, the guard decides: "Can YOU see THIS row?" It checks the rules you define using `auth.uid()`.

### What is `auth.uid()`?

`auth.uid()` returns the user ID of whoever is **currently logged in**. If nobody is logged in, it returns `null`.

So a rule like this means: **"You can only see attendance rows where YOU are the student."**

```sql
-- You can only READ attendance where student_id equals YOUR user id
create policy "Students can view their own attendance"
  on public.attendance for select
  using (auth.uid() = student_id);
```

### Reading a policy line by line

```sql
create policy "Students can view their own attendance"   -- name of the rule
  on public.attendance for select                        -- applies to SELECT (reading)
  using (auth.uid() = student_id);                        -- the rule: only if you are the student
```

| Keyword | Meaning |
|---|---|
| `create policy "name"` | Create a named security rule. |
| `on public.attendance` | Which table the rule protects. |
| `for select` | The action the rule controls. (`select` = read, `insert` = add, `update` = change, `delete` = remove) |
| `using (...)` | The condition that must be TRUE for the row to be visible. |
| `with check (...)` | The condition that must be TRUE to ADD/change a row. |

### The policies we wrote (and why)

| Policy | Action | Rule |
|---|---|---|
| "Profiles are viewable by owner" | select | you see your own profile only |
| "Users can insert their own profile" | insert | you can create your own profile |
| "Users can update their own profile" | update | you can edit your own profile |
| "Teachers can view profiles of their attendees" | select | a teacher can read the profile (name) of students who attended their events — added later in the "attendee names" enhancement (see the Phase 6/10 material) |
| "Events are readable by any authenticated user" | select | any logged-in user can read events (needed to validate QR codes) |
| "Users can insert events" | insert | any logged-in user can create an event |
| "Users can update their own events" | update | you can edit events you created |
| "Students can view their own attendance" | select | you see your own attendance only |
| "Students can insert their own attendance" | insert | you can add your own attendance |
| "Teachers can view attendance for their events" | select | teachers see attendance for events they created |

> 💡 **KEY CONCEPT — Row Level Security (RLS):** RLS is **not optional** in a multi-user app. It's the difference between "anyone with the key can read everything" and "each user can only see their own data." Later phases will rely on it heavily.

---

## 9. THE TRIGGER — AUTOMATIC PROFILES

When a new user signs up in Phase 2, we want their `profiles` row to be **created automatically**. We don't want a student to have to do it manually. PostgreSQL has a feature for this: a **trigger**.

A trigger is: **"When THIS happens to THIS table, automatically run THIS function."**

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

| Piece | Meaning |
|---|---|
| `create or replace function handle_new_user()` | Define a function named `handle_new_user`. |
| `returns trigger language plpgsql` | It's a trigger function, written in plpgsql (PostgreSQL's SQL language). |
| `begin ... insert into profiles (id, email) values (new.id, new.email) ... end` | The function inserts a new profile using the new user's id and email. `new.id` / `new.email` = the values of the row that just got inserted into `auth.users`. |
| `create trigger on_auth_user_created` | Name the trigger. |
| `after insert on auth.users` | Run it AFTER a new row is inserted into `auth.users` (after a signup). |
| `for each row execute procedure handle_new_user()` | Run the function for every new row. |

**The flow:**
1. User signs up in the app (Phase 2) → Supabase adds a row to `auth.users`
2. Trigger fires automatically
3. A matching `profiles` row is created with that user's id and email
4. Done — no manual work needed

> ✅ **STOP AND THINK:** What would happen if a user signed up but the trigger didn't exist? (Hint: think about what happens when the app tries to read the profile of a user who has none.)

---

## 10. SQLITE vs POSTGRESQL — SIDE BY SIDE

| Feature | SQLite (old) | Supabase PostgreSQL (new) |
|---|---|---|
| Where it lives | Local file on your device | In the cloud (Supabase) |
| Users | Hardcoded `STUDENT-2026-001` | Real accounts in `auth.users` |
| Security | None — anyone can read/write | RLS policies per user |
| IDs | `INTEGER` auto-increment | `uuid` (globally unique) |
| Timestamps | `TEXT` strings | `timestamptz` (timezone-aware) |
| Foreign keys | Not enforced | Enforced by the database |
| Sharing | Impossible | Data available across devices |
| Backups | None | Automatic (cloud) |

**The big win:** Data is now **shared, secure, and backed up**.

---

## 11. HOW THE APP WILL USE THIS (Preview of Phase 4+)

Soon, your app's code will map to the tables like this:

| App action (in code) | Database action |
|---|---|
| Student scans a QR code | Validate `event` → find/create `events` row → insert `attendance` row |
| Check "Already registered?" | The `unique (student_id, event_id)` constraint rejects a duplicate |
| View attendance history | `SELECT` from `attendance` JOIN `events` where `student_id = auth.uid()` |
| Teacher creates an event | `INSERT` into `events` |
| Sign up (Phase 2) | Trigger auto-creates a `profiles` row |

This is what Phase 4 will build. For now, just understand the **structure** — the code comes next.

---

## 12. RUNNING THE SQL — YOUR LAB TASK

You will now actually create these tables in **your own** Supabase project.

### Step 1: Open the SQL Editor

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click your project
3. Click **SQL Editor** in the left sidebar
4. Click **New query**

### Step 2: Paste the code

1. Open the file **`supabase/schema.sql`** in your project
2. Select ALL of it and copy (Ctrl+A, Ctrl+C)
3. Paste (Ctrl+V) into the SQL Editor window

### Step 3: Run it

- Click **Run** (or press Ctrl+Enter)
- ✅ **Expected:** "Success. No rows returned." (Tables don't return data — they just exist.)

> **Troubleshooting:** If you get an error like `policy ... already exists`, that means you ran it before. The script is now **idempotent** (safe to re-run) — just Run it again.

### Step 4: Verify the tables exist

1. Click **Table Editor** in the left sidebar
2. You should see a **`public`** schema with **three tables**:
   - `attendance`
   - `events`
   - `profiles`
3. **If you don't see them:** refresh the browser page (F5). Sometimes the Table Editor needs a reload to show new tables.

### Step 5: Verify RLS is on

For EACH table (attendance, events, profiles):
1. Click the table name in Table Editor
2. Look at the top-right — the **RLS** toggle should show "RLS enabled"
3. Toggle it ON if it's off (it should already be on from the SQL)

---

## 13. LAB CHECKLIST (Tick these off as you work)

| # | Task | Done? |
|---|---|---|
| 1 | Opened the SQL Editor in Supabase | ☐ |
| 2 | Pasted the full contents of `supabase/schema.sql` | ☐ |
| 3 | Ran the SQL successfully (no errors) | ☐ |
| 4 | `profiles` table appears in Table Editor | ☐ |
| 5 | `events` table appears in Table Editor | ☐ |
| 6 | `attendance` table appears in Table Editor | ☐ |
| 7 | RLS enabled on `profiles` | ☐ |
| 8 | RLS enabled on `events` | ☐ |
| 9 | RLS enabled on `attendance` | ☐ |
| 10 | I understand what a Primary Key is | ☐ |
| 11 | I understand what a Foreign Key is | ☐ |
| 12 | I understand why `unique (student_id, event_id)` prevents double-scanning | ☐ |
| 13 | I understand what RLS does | ☐ |
| 14 | I understand how the trigger auto-creates profiles | ☐ |

---

## 14. CHECK YOUR UNDERSTANDING (Quiz)

Answer these to make sure you've got it before moving on.

1. **What is a Primary Key?** Why does every table have one?
2. **What is a Foreign Key?** Give one example from our schema.
3. Which column in `attendance` prevents a student from scanning the same event twice?
4. What does `auth.uid()` return?
5. If we had NO Row Level Security, what could any app user do?
6. Why do we name the column `end_time` instead of `end`?
7. What does the `on_auth_user_created` trigger do, and WHEN does it run?
8. Explain "1 to many relationship" using `events` and `attendance` as an example.

*(Answers are at the bottom of this document — try them first without peeking!)*

---

## 15. COMMON ERRORS (Real problems you might hit)

### Error: `syntax error at or near "end"`

**Cause:** `end` is a **reserved word** in PostgreSQL. A column can't be named `end`.

**Fix:** We use `end_time` (and `start_time`) in the schema. The QR payload still uses `start`/`end`, but the database stores them as `start_time`/`end_time`.

### Error: `policy "..." for table "..." already exists`

**Cause:** You're running the script a second time and the policy already exists.

**Fix:** The script now has `drop policy if exists` before each policy, so this shouldn't happen. If it does, just re-run — or run the latest `supabase/schema.sql` which is idempotent.

### Error: `permission denied for table`

**Cause:** An RLS policy is blocking access.

**Fix:** Check the policy's `using` / `with check` clauses. Make sure `auth.uid()` is compared to the right column.

### Error: `duplicate key value violates unique constraint`

**Cause:** A UNIQUE constraint (like `(student_id, event_id)`) was violated.

**Fix:** This is expected — the app will catch this and show "Already registered for this event."

---

## 16. WHAT YOU SHOULD HAVE NOW

✅ A `profiles` table (linked to auth.users)
✅ An `events` table
✅ An `attendance` table
✅ RLS enabled on all three
✅ An auto-profile trigger installed
✅ The app still works with SQLite (we haven't changed any code yet — that's Phase 4!)

**You built a real secure cloud database. Give yourself a pat on the back.** 🎉

---

## CHECK YOUR UNDERSTANDING — ANSWERS

1. **Primary Key:** The column that uniquely identifies each row (like a national ID). Every table has one so you can find/connect specific rows.
2. **Foreign Key:** A column that references the Primary Key of another table, connecting them. Example: `attendance.student_id → auth.users.id`.
3. The `unique (student_id, event_id)` constraint.
4. The user ID of the currently logged-in user (or `null` if not logged in).
5. They could read (or modify) everyone's data, since the key is in the app's code.
6. Because `end` is a reserved word in PostgreSQL.
7. It auto-creates a `profiles` row for a new user, and runs AFTER a row is inserted into `auth.users` (on signup).
8. One event can have many attendance rows (1 event → many scans), but each attendance row links to exactly one event.

---

*Phase 3 completed 2026-09-03.*
