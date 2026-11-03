# Current Architecture — QR-ATT (Before Migration)

> This document captures the COMPLETE state of the application BEFORE any Supabase migration.
> Its purpose is to serve as a known-good baseline so the student can compare old vs new code at every step.

---

## 1. Application Overview

**QR-ATT** is a React Native mobile application for recording school event attendance by scanning QR codes.

**Core workflow:**
1. A teacher creates an event (title, code, start time, end time)
2. The app generates a QR code containing the event details
3. A student scans the QR code with their phone camera
4. The app validates the QR payload and records attendance in a local SQLite database
5. The student can view their attendance history

**Current limitations:**
- Single hardcoded user (`STUDENT-2026-001`)
- No authentication or login
- All data stored locally on one device (SQLite)
- No cloud sync, no multi-device support
- No teacher vs student role distinction
- No Row Level Security
- No backend server

---

## 2. Technology Stack

| Category | Package | Version |
|---|---|---|
| Framework | expo | ~54.0.35 |
| UI | react | 19.1.0 |
| Mobile | react-native | 0.81.5 |
| Language | typescript | ~5.9.2 |
| Routing | expo-router | ~6.0.24 |
| Navigation | @react-navigation/bottom-tabs | ^7.4.0 |
| Navigation | @react-navigation/native | ^7.1.8 |
| Navigation | @react-navigation/elements | ^2.6.3 |
| Camera | expo-camera | ~17.0.10 |
| Database | expo-sqlite | ~16.0.10 |
| QR Generation | react-native-qrcode-svg | ^6.3.21 |
| QR Support | react-native-svg | 15.12.1 |
| Animations | react-native-reanimated | ~4.1.1 |
| Date Picker | @react-native-community/datetimepicker | 8.4.4 |
| Icons | @expo/vector-icons | ^15.0.3 |
| Image | expo-image | ~3.0.11 |
| Font | expo-font | ~14.0.12 |
| Splash | expo-splash-screen | ~31.0.13 |
| Status Bar | expo-status-bar | ~3.0.9 |
| System UI | expo-system-ui | ~6.0.9 |
| Constants | expo-constants | ~18.0.13 |
| Linking | expo-linking | ~8.0.12 |
| Gesture | react-native-gesture-handler | ~2.28.0 |
| Safe Area | react-native-safe-area-context | ~5.6.0 |
| Screens | react-native-screens | ~4.16.0 |
| Web | react-native-web | ~0.21.0 |
| React DOM | react-dom | 19.1.0 |

**Dev Dependencies:**
| Package | Version |
|---|---|
| @types/react | ~19.1.0 |
| typescript | ~5.9.2 |

---

## 3. File Structure

```
QR-APP-main/
├── app/
│   ├── _layout.tsx                  # Root Stack layout
│   ├── +not-found.tsx               # 404 screen
│   └── (tabs)/
│       ├── _layout.tsx              # Bottom tab navigator (5 tabs)
│       ├── index.tsx                # Home screen
│       ├── scan.tsx                 # QR scanner screen
│       ├── history.tsx              # Attendance history screen
│       ├── teacher.tsx              # Teacher event creation screen
│       └── profile.tsx              # Profile placeholder screen
├── components/
│   ├── AppButton.tsx                # Reusable button with icon
│   └── Header.tsx                   # Header with QR logo + title
├── constants/
│   ├── colors.ts                    # Color palette (blue theme)
│   └── student.ts                   # Hardcoded STUDENT_ID
├── lib/
│   └── database.ts                  # SQLite database layer
├── assets/
│   ├── expo.icon/                   # Expo icon files
│   └── images/                      # App icons, splash, etc.
├── docs/                            # Migration documentation
├── app.json                         # Expo configuration
├── package.json                     # Dependencies
├── package-lock.json                # Lock file
├── tsconfig.json                    # TypeScript config
├── .gitignore                       # Git ignore rules
└── README.md                        # Project readme
```

---

## 4. Navigation Structure

### Root Layout (`app/_layout.tsx`)

```
Stack
└── Screen "(tabs)" [headerShown: false]
```

Single stack navigator containing the tab group. No authentication gates.

### Tab Layout (`app/(tabs)/_layout.tsx`)

```
Tabs (dark theme: #25292e, active tint: #ffd33d)
├── index      → "Home"        (home icon)
├── scan       → "Scan"        (qr-code icon)
├── history    → "History"     (time icon)
├── teacher    → "Teacher"     (clipboard icon)
└── profile    → "Profile"     (person icon)
```

**All 5 tabs are always accessible.** No role checks, no auth guards.

---

## 5. Color Palette (`constants/colors.ts`)

```typescript
export const COLORS = {
  primary:       '#1565C0',  // Blue — buttons, accents
  background:    '#b1cdf7',  // Light blue — screen backgrounds
  card:          '#67acfc',  // Medium blue — card backgrounds, default buttons
  textPrimary:   '#0D1B2A',  // Dark navy — headings, primary text
  textSecondary: '#546E7A',  // Gray — subtitles, secondary text
  textOnPrimary: '#FFFFFF',  // White — text on primary-colored buttons
  surface:       '#E3F2FD',  // Very light blue — logo circle background
  border:        '#E0E8F0',  // Light gray — input borders
  shadow:        '#0D47A1',  // Dark blue — shadow color
} as const;
```

---

## 6. Hardcoded Student Identity (`constants/student.ts`)

```typescript
export const STUDENT_ID = 'STUDENT-2026-001';
```

**This is the single biggest limitation.** Every screen that needs to identify "who" uses this hardcoded string. There is no login, no registration, no user concept.

---

## 7. Components

### Header (`components/Header.tsx`)

**Props:** `{ title: string }`

**Renders:**
- 72px diameter circle with `MaterialIcons` QR scanner icon (blue on light blue)
- Title text below (24px, bold, dark navy)

**Used in:** Home screen only.

### AppButton (`components/AppButton.tsx`)

**Props:** `{ title: string, icon: keyof typeof Ionicons.glyphMap, theme?: 'primary', onPress: () => void }`

**Two variants:**

| Variant | Background | Text/Icon Color | Border | Border Radius |
|---|---|---|---|---|
| Default | `#67acfc` (card) | `#546E7A` (gray) | None | 14px |
| Primary | `#1565C0` (blue) | `#FFFFFF` (white) | 3px blue | 18px |

**Layout:** Full width, row direction (icon + label), 16px vertical padding, shadow.

---

## 8. Screen Details

### Home Screen (`app/(tabs)/index.tsx`)

**Purpose:** Landing page with navigation buttons.

**Layout:**
- `SafeAreaView` with light blue background
- Header component (flex: 1, centered)
- Title: "School Event Attendance" (18px, blue)
- Subtitle: description text (14px, gray)
- Three buttons (flex: 1/3):
  1. "Scan QR Code" (primary) → `/scan`
  2. "Attendance History" (default) → `/history`
  3. "Profile" (default) → `/profile`

**State:** None. Pure navigation screen.

### Scan Screen (`app/(tabs)/scan.tsx`)

**Purpose:** Camera QR scanner.

**State:**
```typescript
permission: CameraPermission | null
scanned: boolean
lastData: string | null
message: string | null
success: boolean
```

**Three rendering states:**

1. **Loading:** Empty view while permission loads
2. **No permission:** Title + "Grant Permission" button
3. **Permission granted:** Full-screen camera + bottom overlay card

**On scan:**
1. `setScanned(true)` — stops further scanning
2. Calls `registerAttendance(data, STUDENT_ID)`
3. Displays result message (green = success, red = error)
4. Shows raw QR data
5. "Scan Again" button resets state

**Key detail:** Uses `STUDENT_ID` from constants — hardcoded identity.

### History Screen (`app/(tabs)/history.tsx`)

**Purpose:** Display past attendance records.

**State:**
```typescript
records: AttendanceRecord[]
loading: boolean
```

**Data loading:** Uses `useFocusEffect` to reload every time the screen gains focus.

**Rendering states:**
1. Loading: "Loading records..."
2. Empty: "No records yet..."
3. Data: `FlatList` of cards

**Card contents:** Event title, event ID, scannedAt (formatted with `toLocaleString`).

**Key detail:** Calls `getAttendanceHistory(STUDENT_ID)` — hardcoded identity.

### Teacher Screen (`app/(tabs)/teacher.tsx`)

**Purpose:** Create events and generate QR codes.

**State:**
```typescript
title: string
eventId: string
startDate: Date
endDate: Date
editTarget: 'start' | 'end' | null
editingPart: 'date' | 'time'
payload: string | null
message: string | null
```

**Form fields:**
- Event Title (TextInput)
- Event Code (TextInput, auto-capitalize)
- Start Time (Pressable → DateTimePicker)
- End Time (Pressable → DateTimePicker)
- Quick duration chips: +30 min, +1 hour, +2 hours

**DateTimePicker behavior:**
- Android: Split mode (date first, then time)
- iOS: Combined datetime spinner

**On create:**
1. Validate: all fields required, start < end
2. Call `createEvent()` to save to SQLite
3. Generate QR payload JSON
4. Display QR code via `react-native-qrcode-svg`

**QR Payload format:**
```json
{
  "v": 1,
  "event": "EVT-2026-0001",
  "title": "Founders Day Assembly",
  "start": "2026-09-03T09:00:00",
  "end": "2026-09-03T11:00:00"
}
```

### Profile Screen (`app/(tabs)/profile.tsx`)

**Purpose:** Placeholder.

**Renders:** Title "My Profile" + subtitle "Profile management will be available in a future phase."

### 404 Screen (`app/+not-found.tsx`)

**Purpose:** Handle unknown routes.

**Renders:** "Oops! Not Found" + link back to home.

---

## 9. Database Architecture (`lib/database.ts`)

### Database Engine

- **Engine:** expo-sqlite (SQLite)
- **Database name:** `qr-attendance.db`
- **PRAGMA:** `journal_mode = WAL`

### Tables

#### `events`

```sql
CREATE TABLE IF NOT EXISTS events (
  eventId TEXT PRIMARY KEY NOT NULL,
  title   TEXT NOT NULL,
  start   TEXT NOT NULL,
  end     TEXT NOT NULL
);
```

| Column | Type | Constraint | Purpose |
|---|---|---|---|
| eventId | TEXT | PRIMARY KEY | Unique event identifier (e.g., "EVT-2026-0001") |
| title | TEXT | NOT NULL | Human-readable event name |
| start | TEXT | NOT NULL | ISO 8601 start datetime string |
| end | TEXT | NOT NULL | ISO 8601 end datetime string |

#### `attendance`

```sql
CREATE TABLE IF NOT EXISTS attendance (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId TEXT NOT NULL,
  eventId   TEXT NOT NULL,
  scannedAt TEXT NOT NULL,
  UNIQUE (studentId, eventId)
);
```

| Column | Type | Constraint | Purpose |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Row ID |
| studentId | TEXT | NOT NULL | Student identifier |
| eventId | TEXT | NOT NULL | References events.eventId |
| scannedAt | TEXT | NOT NULL | ISO 8601 timestamp of scan |
| — | — | UNIQUE(studentId, eventId) | Prevents duplicate attendance |

### Database Functions

#### `registerAttendance(rawPayload: string, studentId: string): Promise<RegisterResult>`

**Purpose:** Parse QR code, validate, record attendance.

**Validation chain:**
1. Parse JSON → fail = "Invalid QR code."
2. Check `v === 1` and `event` field → fail = "Not an attendance QR code."
3. Check `start` → if now < start → "Event has not started yet."
4. Check `end` → if now > end → "Event has already ended."
5. Insert event into `events` table (INSERT OR IGNORE)
6. Insert into `attendance` table (INSERT OR IGNORE)
7. If `changes === 0` → "Already registered for this event."
8. Success → "Attendance recorded!"

**Return type:**
```typescript
type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};
```

#### `getAttendanceHistory(studentId: string): Promise<AttendanceRecord[]>`

**Purpose:** Get all attendance records for a student, joined with event titles.

**Query:**
```sql
SELECT a.id, a.eventId, e.title AS eventTitle, a.scannedAt
FROM attendance a
JOIN events e ON e.eventId = a.eventId
WHERE a.studentId = ?
ORDER BY a.scannedAt DESC
```

**Return type:**
```typescript
type AttendanceRecord = {
  id: number;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};
```

#### `createEvent(event: Event): Promise<void>`

**Purpose:** Insert or replace an event.

**Query:**
```sql
INSERT OR REPLACE INTO events (eventId, title, start, end) VALUES (?, ?, ?, ?)
```

**Parameter type:**
```typescript
type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};
```

---

## 10. QR Code System

### Payload Format

```json
{
  "v": 1,
  "event": "EVT-2026-0001",
  "title": "Founders Day Assembly",
  "start": "2026-09-03T09:00:00",
  "end": "2026-09-03T11:00:00"
}
```

| Field | Type | Required | Purpose |
|---|---|---|---|
| v | number | Yes | Version number (must be 1) |
| event | string | Yes | Event code / identifier |
| title | string | No | Human-readable event name |
| start | string | No | ISO 8601 start time |
| end | string | No | ISO 8601 end time |

**Why versioned:** Allows future payload format changes without breaking old QR codes.

### Generation Flow

```
Teacher fills form
→ handleCreateEvent()
→ createEvent() saves to SQLite
→ JSON.stringify payload
→ <QRCode value={payload} size={200} />
→ QR image displayed on screen
```

### Scanning Flow

```
Student opens Scan tab
→ Camera permission check
→ CameraView renders (back camera, QR type)
→ onBarcodeScanned fires
→ setScanned(true) — locks scanning
→ registerAttendance(data, STUDENT_ID)
→ Parse JSON
→ Validate version + time
→ Insert into SQLite
→ Display result message
→ "Scan Again" resets state
```

---

## 11. Authentication Situation

**There is NO authentication.**

- No login screen
- No registration screen
- No user accounts
- No session management
- No token handling
- No auth state

The entire app operates as a single user identified by a hardcoded string:
```typescript
const STUDENT_ID = 'STUDENT-2026-001';
```

---

## 12. Authorization Situation

**There is NO authorization.**

- No roles (student/teacher/admin)
- No permissions
- No access control
- All screens accessible to everyone
- Teacher tab is just a different screen, not a protected role

---

## 13. Security Model

**Current security: None.**

- Data stored locally on device only
- No network calls
- No server to attack
- No user distinction to exploit
- But also: no multi-user support, no data portability

---

## 14. Dependencies Relevant to Migration

### Will Be Replaced

| Current | Replacement | Reason |
|---|---|---|
| expo-sqlite | Supabase PostgreSQL | Cloud database |
| `lib/database.ts` | `lib/supabase.ts` + service modules | Supabase client |
| hardcoded STUDENT_ID | Supabase auth user ID | Multi-user support |
| local-only data | Cloud-synced data | Multi-device support |

### Will Be Added

| Package | Purpose |
|---|---|
| @supabase/supabase-js | Supabase JavaScript client |
| expo-secure-store (maybe) | Secure token storage |
| react-native-url-polyfill | URL polyfill for Supabase |

### Will Be Removed (eventually)

| Package | Reason |
|---|---|
| expo-sqlite | Replaced by Supabase |

### Will Remain Unchanged

| Package | Reason |
|---|---|
| expo-camera | Still needed for QR scanning |
| react-native-qrcode-svg | Still needed for QR generation |
| react-native-svg | Dependency of qrcode-svg |
| @react-native-community/datetimepicker | Still needed for event form |
| @expo/vector-icons | Still needed for icons |
| react-native-reanimated | May be used later for animations |
| All navigation packages | Navigation structure preserved |

---

## 15. Current Limitations Summary

| # | Limitation | Impact |
|---|---|---|
| 1 | Single hardcoded user | Cannot support real students |
| 2 | No authentication | Anyone with device has full access |
| 3 | No registration | Cannot create real accounts |
| 4 | No login/logout | No session management |
| 5 | SQLite is local only | Data lost if app uninstalled |
| 6 | No cloud sync | Cannot use multiple devices |
| 7 | No API calls | No server communication |
| 8 | No student/teacher roles | Teacher tab accessible to all |
| 9 | No admin role | No user management |
| 10 | No Row Level Security | No data access controls |
| 11 | No environment variables | Config hardcoded |
| 12 | No automated tests | No regression protection |
| 13 | Profile is placeholder | No user information displayed |
| 14 | No error handling for network | Will fail silently on network issues |
| 15 | No offline handling | No graceful degradation |

---

## 16. Proposed Migration Architecture

```
                QR-ATT MOBILE APP (After Migration)
                        |
                React Native / Expo
                        |
                Supabase Client (@supabase/supabase-js)
                        |
      +-----------------+-----------------+-----------------+
      |                 |                 |                 |
   AUTH             DATABASE             RLS             PROFILES
      |                 |                 |                 |
  Login/Register    PostgreSQL        Security Rules    User Info
  Session           profiles          Student: own      Student ID
  Logout            events            Teacher: events   Full Name
  Current User      attendance        Admin: all        Course
                                      Role checks      Year Level
                                                       Role
```

### Target PostgreSQL Schema

```sql
-- profiles (linked to auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  student_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  course TEXT,
  year_level TEXT,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  start TIMESTAMPTZ NOT NULL,
  end TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- attendance
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) NOT NULL,
  event_id UUID REFERENCES events(id) NOT NULL,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, event_id)
);
```

### Target Service Module Structure

```
lib/
├── supabase.ts         # Supabase client initialization
├── auth.ts             # Sign up, sign in, sign out, current user
├── profiles.ts         # Create/read/update profiles
├── events.ts           # Create/read events
└── attendance.ts       # Register/read attendance
```

---

## 17. Migration Phase Roadmap

| Phase | Goal | Key Learning |
|---|---|---|
| 0 | Baseline (this document) | Understand before changing |
| 1 | Supabase project setup | Environment variables, client init |
| 2 | Authentication | Sign up, sign in, sessions |
| 3 | Database design | PostgreSQL schema, relationships |
| 4 | User profiles | Auth ≠ profile, role defaults |
| 5 | Row Level Security | Authorization at DB level |
| 6 | Events (Supabase) | Cloud event storage |
| 7 | QR generation | Preserve format, cloud events |
| 8 | QR attendance | Cloud attendance recording |
| 9 | Attendance history | Cloud queries |
| 10 | Teacher role | Role-based access control |
| 11 | Route protection | Auth guards, role guards |
| 12 | Profile screen | Real user information |
| 13 | Error handling | Production-ready UX |
| 14 | Testing | Manual test cases |
| 15 | Remove SQLite | Clean up old dependencies |
| 16 | Final cleanup | Code quality review |
| 17 | Student guide | Complete learning documentation |

---

## 18. Files Expected to Change During Migration

### Files to Create

| File | Purpose |
|---|---|
| `lib/supabase.ts` | Supabase client initialization |
| `lib/auth.ts` | Authentication service |
| `lib/profiles.ts` | Profile service |
| `lib/events.ts` | Event service |
| `lib/attendance.ts` | Attendance service |
| `app/login.tsx` | Login screen |
| `app/register.tsx` | Registration screen |
| `.env.example` | Environment variable template |
| `.env` | Environment variables (gitignored) |
| `docs/*.md` | Documentation files |

### Files to Modify

| File | Changes |
|---|---|
| `package.json` | Add Supabase, remove SQLite (eventually) |
| `app/_layout.tsx` | Add auth gate |
| `app/(tabs)/_layout.tsx` | Conditional tab visibility |
| `app/(tabs)/scan.tsx` | Use auth user instead of hardcoded ID |
| `app/(tabs)/history.tsx` | Use Supabase query instead of SQLite |
| `app/(tabs)/teacher.tsx` | Use Supabase for event creation |
| `app/(tabs)/profile.tsx` | Display real profile data |
| `constants/student.ts` | Remove or deprecate |
| `lib/database.ts` | Remove (eventually) |

### Files Unchanged

| File | Reason |
|---|---|
| `components/Header.tsx` | UI only, no data logic |
| `components/AppButton.tsx` | UI only, no data logic |
| `constants/colors.ts` | Design tokens, no change needed |
| `app/+not-found.tsx` | Error screen, no data logic |
| `assets/*` | Images, no change needed |

---

## 19. Potential Risks

| Risk | Mitigation |
|---|---|
| Supabase free tier limits | Use wisely, monitor usage |
| Expo compatibility with Supabase | Use @supabase/supabase-js (compatible) |
| Token storage security | Use expo-secure-store |
| Breaking existing QR format | Preserve v:1 format |
| Data migration | No existing data to migrate (fresh start) |
| Student confusion | Thorough documentation at each step |

---

## 20. Baseline Testing Checklist

Before starting migration, verify:

- [ ] App starts without errors
- [ ] Home screen displays correctly
- [ ] Navigation between all 5 tabs works
- [ ] Scan tab requests camera permission
- [ ] Teacher tab creates event and generates QR
- [ ] QR code is scannable
- [ ] Scan tab records attendance
- [ ] History tab displays records
- [ ] Duplicate scan shows "Already registered"
- [ ] 404 screen works

---

*This document was created on 2026-09-03 as Phase 0 of the Supabase migration.*
*No code was modified during this phase.*
