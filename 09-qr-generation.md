# Migration Phase 8 — QR Generation (v:1 Format, Cloud-Backed)

> This is a **student lab activity**. This is migration **Phase 8**. In this phase we formalize how QR codes are **built** and **parsed** so the format never drifts: a dedicated `lib/qr.ts` with a canonical `v:1` payload builder (`buildQRPayload`) and a validator (`parseQRPayload`). We also make QRs **cloud-backed** — the QR is only shown after the event is actually saved to Supabase.

---

## HOW TO USE THIS DOCUMENT (Read Me First)

In this phase you will:
1. **LEARN** — the QR payload contract and why it must be centralized
2. **CODE** — `lib/qr.ts`, then wire the Teacher screen and the scanner to it
3. **VERIFY** — typecheck + scan-to-register round trip

**Time needed:** ~30 minutes
**You will need:** Phases 4-7 (Supabase data layer, events service, role gate).

---

## 1. WHAT ARE WE DOING AND WHY?

### The Problem

QR generation and validation logic was **duplicated and hand-written in two places**:
- The **Teacher screen** built the QR text with an inline `JSON.stringify({ v: 1, event, title, start, end })`.
- The **scanner** (`registerAttendance`) re-parsed the text and re-checked `v === 1` inline.

If someone changed one side but not the other, QR codes would silently break. We want **one source of truth** for the QR format.

### The Goal

1. **`lib/qr.ts`** — a single module with:
   - `buildQRPayload(...)` — builds the canonical `v:1` QR text.
   - `parseQRPayload(...)` — validates + decodes a scanned QR.
2. **Cloud-backed generation** — the QR is only shown after the event is saved to Supabase (via `createEvent` from Phase 7).
3. Both the Teacher screen and the scanner use the SAME helpers.

### The Analogy: A Standard Contract

Think of the QR payload as a **contract** between two parties:
- **Generator** (Teacher screen) signs the contract.
- **Validator** (Scanner) checks the signature.

If both sides use the SAME form document (`lib/qr.ts`), they can never disagree about the format.

---

## 2. THE QR PAYLOAD FORMAT (v:1)

A QR code just contains a **JSON string**. Here's the shape:

```json
{
  "v": 1,
  "event": "EVT-2026-0002",
  "title": "Founders Day Assembly",
  "start": "2026-09-03T09:00:00",
  "end": "2026-09-03T11:00:00"
}
```

| Key | Type | Meaning |
|---|---|---|
| `v` | number | **Format version** (`1`). This lets you change the format later while old QRs still say which version they are. |
| `event` | string | The public **event code** (embedded in the QR). |
| `title` | string | Event name (optional). |
| `start` | string | Start time (optional, in local ISO form). |
| `end` | string | End time (optional). |

> 💡 Note `event` (not `eventId`) and `v:1`. This is the **existing format** — we are *formalizing* it, not changing it, so all the Phase 4 scanning logic keeps working.

---

## 3. NEW FILE: `lib/qr.ts`

### 3a. The type

```typescript
export type QRPayload = {
  v: 1;
  event: string;
  title?: string;
  start?: string;
  end?: string;
};
```

- `v: 1` (with the literal `1`) means TypeScript enforces that version is exactly 1.

### 3b. `buildQRPayload` — the builder

```typescript
export function buildQRPayload(event: {
  eventId: string;
  title: string;
  start?: string;
  end?: string;
}): string {
  const payload: QRPayload = {
    v: 1,
    event: event.eventId,
  };

  if (event.title) payload.title = event.title;
  if (event.start) payload.start = event.start;
  if (event.end) payload.end = event.end;

  return JSON.stringify(payload);
}
```

| Line | Meaning |
|---|---|
| `v: 1, event: event.eventId` | The version + event code are always included. |
| `if (event.title) payload.title = ...` | Only include optional fields if they exist (keeps the QR small). |
| `return JSON.stringify(payload)` | Convert to the QR text. |

> **Why `eventId` → `event`?** The builder takes the app-friendly `eventId` name but stores it as `event` in the payload, matching the scanner. Centralizing this mapping is the whole point.

### 3c. `parseQRPayload` — the validator

```typescript
export type ParseQRResult =
  | { ok: true; payload: QRPayload }
  | { ok: false; message: string };

export function parseQRPayload(raw: string): ParseQRResult {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Invalid QR code.' };
  }

  if (parsed.v !== 1 || typeof parsed.event !== 'string' || !parsed.event) {
    return { ok: false, message: 'Not an attendance QR code.' };
  }

  return { ok: true, payload: parsed as QRPayload };
}
```

| Line | Meaning |
|---|---|
| `try { JSON.parse(raw) }` | If it's not valid JSON → "Invalid QR code." |
| `parsed.v !== 1` | Reject if it's not format version 1. |
| `typeof parsed.event !== 'string' \|\| !parsed.event` | Reject if there's no event code. |
| `return { ok: true, payload }` | Success → the decoded payload for the caller. |

> 💡 **Discriminated union result:** `{ ok: true }` or `{ ok: false }`. The caller checks `result.ok` before using `result.payload`, so it can't accidentally read a failed parse.

---

## 4. WIRE THE TEACHER SCREEN (generation, cloud-backed)

### 4a. Import the builder

```typescript
import { buildQRPayload } from '@/lib/qr';
```

### 4b. Build the payload AFTER the event is saved

```typescript
createEvent(eventData).then(({ error }) => {
  if (error) {
    setMessage('Could not save the event. Please try again.');
    return;
  }
  setMessage('Event saved! Scan the QR with the Scan tab to test it.');
  setPayload(buildQRPayload(eventData));   // <-- now uses lib/qr.ts
});
```

| Piece | Meaning |
|---|---|
| `check({ error })` | Only show the QR if the **cloud save succeeded** (cloud-backed). |
| `buildQRPayload(eventData)` | Generate the QR text using the shared builder. |

> ✅ Before, the QR text was hand-written JSON in the screen. Now it's the canonical builder — guaranteed to match what the scanner expects.

---

## 5. WIRE THE SCANNER (validation)

`registerAttendance` in `lib/database.ts` now uses the shared parser:

```typescript
import { parseQRPayload } from './qr';

export async function registerAttendance(rawPayload, studentId) {
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }
  const payload = parsed.payload;
  // ...then the existing time-window + event + attendance logic (Phase 4)
}
```

| Before (Phase 4) | After (Phase 8) |
|---|---|
| inline `JSON.parse` + `v !== 1` check in `registerAttendance` | shared `parseQRPayload` from `lib/qr.ts` |

This removes the duplicate validation. Now **generation and validation both read from the same file** — they can't drift apart.

---

## 6. BEFORE vs AFTER — SIDE BY SIDE

| Aspect | BEFORE (Phase 7) | AFTER (Phase 8) |
|---|---|---|
| QR format | hand-written in Teacher screen | `lib/qr.ts` (`buildQRPayload`) |
| QR validation | inline in `registerAttendance` | `lib/qr.ts` (`parseQRPayload`) |
| Cloud check | QR shown after `createEvent` (no error check) | QR shown only if save succeeds |
| Single source of truth | ❌ | ✅ |

---

## 6.5. STEP-BY-STEP EXECUTION GUIDE (what to type, in order)

> This turns Sections 3–5 into a "do it now" checklist. Edit the files in this order.

### Step 1 — Create `lib/qr.ts` (NEW file, Section 3)
Create `lib/qr.ts` with:
- `export type QRPayload = { v: 1; event: string; title?; start?; end? }`.
- `buildQRPayload(event)` — returns `JSON.stringify({ v: 1, event: event.eventId, ...(optional fields) })`.
- `export type ParseQRResult = { ok: true; payload: QRPayload } | { ok: false; message: string }`.
- `parseQRPayload(raw)` — `JSON.parse` in a try/catch → "Invalid QR code."; reject `v !== 1` or missing/empty `event` → "Not an attendance QR code."; else `{ ok: true, payload }`.

### Step 2 — Edit `app/(tabs)/teacher.tsx` (Section 4)
- `import { buildQRPayload } from '@/lib/qr';`.
- In `handleCreateEvent`, replace the hand-written `JSON.stringify({ v: 1, event, title, start, end })` with `setPayload(buildQRPayload(eventData))`.
- Also check the `{ error }` returned by `createEvent` and only build the QR after the save succeeds.

### Step 3 — Edit `lib/attendance.ts` (Section 5)
- `import { parseQRPayload } from './qr';`.
- In `registerAttendance`, replace the inline `JSON.parse` + `v !== 1` block with `const parsed = parseQRPayload(rawPayload); if (!parsed.ok) return { success: false, message: parsed.message }; const payload = parsed.payload;`.
- Keep the rest of `registerAttendance` (time window, find-or-create, insert, `23505`) unchanged.

### Step 4 — Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors.

### Step 5 — Run & test (Section 7)
```bash
npx expo start
```
Complete Section 7 (generate teacher QR → verify cloud-backed → student scans → negative tests for wrong-version/invalid QRs).

### Step 6 — Tick off Section 8's checklist
Don't continue until all boxes are checked.

---

## 7. TESTING YOUR WORK — THE LAB

### Step 1: Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors.

### Step 2: Start the app
```bash
npx expo start
```

### Step 3: Generate (as a Teacher)
1. Log in as a **Teacher**.
2. Teacher tab → create an event.
3. ✅ A QR appears, and the payload text shows the `v:1` format.

### Step 4: Verify it's cloud-backed
1. Open **Table Editor** → `events`.
2. ✅ The event exists (it was saved before the QR appeared).

### Step 5: Scan (as a Student)
1. Log in as a **Student**.
2. Scan the teacher's QR.
3. ✅ "Attendance recorded!" — because the payload format matches the parser.

### Step 6: Negative tests
| QR text | Expected |
|---|---|
| `not json` | "Invalid QR code." |
| `{"event":"X","title":"Y"}` (no `v:1`) | "Not an attendance QR code." |
| `{"v":2,"event":"X"}` (wrong version) | "Not an attendance QR code." |

---

## 8. LAB CHECKLIST (Tick these off)

| # | Task | Done? |
|---|---|---|
| 1 | `npx tsc --noEmit` passes | ☐ |
| 2 | `lib/qr.ts` created with `buildQRPayload` + `parseQRPayload` | ☐ |
| 3 | Teacher screen uses `buildQRPayload` | ☐ |
| 4 | QR only shows after cloud save succeeds | ☐ |
| 5 | `registerAttendance` uses `parseQRPayload` | ☐ |
| 6 | A valid Teacher QR scans successfully as a Student | ☐ |
| 7 | Wrong-version / invalid QR is rejected with a clear message | ☐ |
| 8 | Payload text in the UI still shows `v:1` | ☐ |
| 9 | I can explain the "single source of truth" idea | ☐ |
| 10 | I can explain why we keep `v` in the payload | ☐ |

---

## 9. CHECK YOUR UNDERSTANDING (Quiz)

1. Why is the QR format centralized in `lib/qr.ts` instead of being written inline in the screens?
2. What does the `v: 1` field do?
3. In `buildQRPayload`, we map `eventId` → `event`. Why?
4. What does `parseQRPayload` return if the text is `not json`?
5. Why do we wait for `createEvent` to succeed before showing the QR?
6. What is a "discriminated union" result and why is it safe?

*(Answers at the bottom — try them first!)*

---

## 10. COMMON ERRORS

### Error: QR generated but the scanner says "Not an attendance QR code."
**Cause:** The generated payload doesn't have `v: 1` and a valid `event`.
**Fix:** Use `buildQRPayload` (not hand-written JSON) so the format matches `parseQRPayload`.

### Error: TypeScript error on `payload.v`
**Cause:** The payload type expects `v: 1` but you assigned a different number.
**Fix:** Keep the version at exactly `1`, or widen the type if you truly need multi-version support.

### Error: QR shows but the event row isn't in Supabase
**Cause:** The QR was set before the cloud save finished, or the save errored silently.
**Fix:** Check the `error` from `createEvent` before calling `setPayload` (as we do now).

---

## 11. WHAT YOU SHOULD HAVE NOW

✅ A single `lib/qr.ts` module (builder + parser)
✅ Teacher screen generates **cloud-backed** `v:1` QRs
✅ Scanner validates through the same module
✅ **One source of truth** — generation and validation can't drift
✅ Invalid/wrong-version QRs are rejected with clear messages

**QR codes are now standardized and cloud-backed — one format, two sides, zero drift.** 🎉

---

## CHECK YOUR UNDERSTANDING — ANSWERS

1. So generation and validation always agree. If one file owns the format, changing it updates BOTH sides, preventing silent breakage.
2. It's the **format version**. It lets the app recognize which format a QR uses, and change the format in the future without breaking old QRs (they still report their `v`).
3. Because the QR payload convention uses the key `event` (the scanner looks for `payload.event`). The builder maps the app's `eventId` to the payload's `event`, centralizing that mapping.
4. It returns `{ ok: false, message: 'Invalid QR code.' }`.
5. So we don't show a QR for an event that failed to save — the QR promises an event that must actually exist in the cloud.
6. A return type like `{ ok: true, payload } | { ok: false, message }`. The caller must check `result.ok` before reading `payload`, so a failed parse can never be treated as success.

---

*Migration Phase 8 completed 2026-09-03.*
