# Visual Identity Redesign — QR-ATT "Kiosk / Badge" Look

> This is a **student lab activity**. This document is **separate from the Supabase migration phases** (0-16). It records a visual redesign applied to the app: moving away from the old blue "soft-shadow SaaS-card" style toward a flat **"kiosk/badge"** aesthetic for a fast, standing-up scan-and-go tool. It also documents the **auth-based redirect** added to the root layout.

---

## HOW TO USE THIS DOCUMENT (Read Me First)

This phase is unusual because it is **visual-only** — almost nothing about *logic* changes. You will:
1. **LEARN** — the design direction and the token system
2. **SEE** — each changed file, with what changed and why
3. **VERIFY** — a typecheck + visual checklist

**Time needed:** ~30 minutes
**You will need:** The app as of Phase 6.

> ⚠️ **Important:** This is NOT Phase 7 of the Supabase migration. (Phase 7 in the migration log is "Events".) This document is numbered 07 only because the Supabase file naming is 00-06. Think of it as a **bonus design pass**, not a database phase.

---

## 1. WHAT WERE WE TRYING TO ACHIEVE?

The old design was a **generic blue SaaS app**: light-blue background, saturated blue cards, and drop shadows everywhere. That look is fine for a dashboard you sit at — but QR-ATT is used **standing up in a hallway**, scanning in a second or two.

So we changed the mood to a **kiosk / badge** feel:

| Old feel | New feel |
|---|---|
| Pure / light-blue background | Warm paper (`#F7F6F2`) |
| Blue = everything | Signal green = "verified / present", amber = pending |
| Drop shadows (`elevation`, `shadowOpacity`) | Flat fills + 1px hairline borders |
| Rounded 14-18px soft shapes | Sharper 10px corners (badge-like) |
| Heavy use of color everywhere | Strong **ink-on-paper** contrast, color reserved for meaning |

> 💡 **The key principle:** **Color now means something.** Green = present/primary action. Amber = pending/late. Ink text on warm paper = calm, readable. Borders (not shadows) define surfaces.

---

## 2. THE DESIGN TOKENS — `constants/colors.ts`

### BEFORE

```typescript
export const COLORS = {
  primary: '#1565C0',      // blue
  background: '#b1cdf7',   // light blue
  card: '#67acfc',         // saturated blue
  textPrimary: '#0D1B2A',
  textSecondary: '#546E7A',
  textOnPrimary: '#FFFFFF',
  surface: '#E3F2FD',
  border: '#E0E8F0',
  shadow: '#0D47A1',
} as const;
```

### AFTER

```typescript
export const COLORS = {
  primary: '#2E7D5B',
  background: '#F7F6F2',
  card: '#FFFFFF',
  textPrimary: '#14181F',
  textSecondary: '#5D6B7A',
  textOnPrimary: '#FFFFFF',
  surface: '#EFF3F0',
  border: '#DADFE3',
  shadow: '#14181F',
  warning: '#C97A2B',
  success: '#2E7D5B',
  danger: '#B3261E',
} as const;
```

| Token | Value | What it means |
|---|---|---|
| `background` | `#F7F6F2` | Warm off-white paper (not pure white). |
| `textPrimary` | `#14181F` | Near-black ink. |
| `textSecondary` | `#5D6B7A` | Muted grey-blue (~60% of ink) for support text. |
| `primary` | `#2E7D5B` | Signal green — verified/present + primary actions. |
| `warning` | `#C97A2B` | Amber — late/pending states (new). |
| `success` | `#2E7D5B` | Same green, named for its "present" use. |
| `danger` | `#B3261E` | Red for errors (new). |
| `border` | `#DADFE3` | Hairline — replaces box-shadows. |
| `card` | `#FFFFFF` | Near-white, only where a true elevated surface is needed. |
| `surface` | `#EFF3F0` | Subtle green-tinted surface (e.g. the Header logo circle). |

> 💡 **We kept every existing key name** (`primary`, `background`, `card`, `textPrimary`, `textSecondary`, `textOnPrimary`, `surface`, `border`, `shadow`) — so no file that imports `COLORS` broke. We **added** `warning`, `success`, and `danger` for new semantic uses.

---

## 3. THE SHARED BUTTON — `components/AppButton.tsx`

The API **did not change**: `{ title, icon, theme?: 'primary', onPress, disabled }`.

### What changed (visual only)

Before, the **non-primary** variant had a `COLORS.card` fill **plus** `shadowColor`/`shadowOffset`/`shadowOpacity`/`elevation`. That was the "soft shadow card" look.

After:

| Variant | Before | After |
|---|---|---|
| `primary` | 3px primary border, radius 18 | 1px primary border, radius 10, green fill, 700-weight label |
| default | card fill + shadow | flat `card` fill + **1px `border` hairline**, radius 10 |
| label weight | 600 | 700 for primary, 600 default |

```typescript
// The shadow block was REMOVED from buttonInner:
//   shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation
// Replaced with a flat hairline for the secondary variant:
secondaryFill: {
  backgroundColor: COLORS.card,
  borderWidth: 1,
  borderColor: COLORS.border,
},
```

> **Why:** The design brief says "replace shadow-based elevation with 1px hairline borders and flat fills." Shadows also render inconsistently across Android/iOS, so hairline borders are more consistent on a phone.

---

## 4. THE SCREENS — `login.tsx` and `register.tsx`

Both screens kept **all logic, state, and handlers untouched**. Only styles changed.

### Headings
- Removed `textAlign: 'center'` — content is now **left-aligned** per the direction.
- `title` bumped to `fontSize: 28`, weight `700` (strong ink heading).
- `subtitle` at 15px, grey-blue, `lineHeight: 21` (proper 400 body text).

### Inputs
- Radius changed `14 → 10` (sharper badge feel).
- Already had a 1px `border` — kept, using the new `border` token.
- Font size `15 → 16` for readability on a phone held standing up.

### Error text
- Color changed from hardcoded `#C62828` → `COLORS.danger`.
- Text alignment changed from `center` → `left` (matches the left-aligned direction).

### Register's role picker (from Phase 5)
- Chips: radius `14 → 10`, flat `card` fill + hairline border.
- Active chip highlight: `COLORS.primary + '14'` (a very faint green tint) with a **700**-weight active label.

---

## 5. THE HOME SCREEN — `app/(tabs)/index.tsx`

- Container no longer `alignItems: 'center'` — content is left-aligned.
- `mainTitle`: `18/600/primary` → `22/700/ink`.
- `subtitle`: no longer centered; grey-blue 15px.
- Bottom action stack stays pinned near the bottom (good for a thumb-reachable primary action).

---

## 6. THE TAB BAR — `app/(tabs)/_layout.tsx`

Before it used **hardcoded dark colors** (#25292e background, #ffd33d active tint) that clashed with the new theme.

After — it uses the tokens:

| Part | Value |
|---|---|
| `tabBarActiveTintColor` | `COLORS.primary` (green active tab) |
| header background | `COLORS.background` (paper) |
| `headerTintColor` | `COLORS.textPrimary` (ink) |
| tab bar background | `COLORS.card` (near-white) |
| tab bar top border | `COLORS.border` (hairline) |

---

## 7. THE AUTH REDIRECT — `app/_layout.tsx`

This is the **one logical change** in this pass. Before, `_layout.tsx` was just a plain Stack. Now it **branches on auth state**.

### The old code

```typescript
import { Stack } from 'expo-router';
export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
```

### The new code

```typescript
import { Redirect, Stack, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';

export default function RootLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const path = segments?.[0];
  const inAuthGroup = path === 'login' || path === 'register';
  const inTabsGroup = path === '(tabs)';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {!session && inTabsGroup && <Redirect href="/login" />}
      {session && inAuthGroup && <Redirect href="/(tabs)" />}
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
```

### Reading it line by line

| Line | Meaning |
|---|---|
| `const { session, loading } = useAuth()` | Read auth state from Phase 2's global store. |
| `if (loading) { return <loading view> }` | While loading, show a centered spinner on the paper background (so it never flashes on a mismatched color). |
| `const segments = useSegments()` | The current route path (e.g. `['login']` or `['(tabs)']`). |
| `inAuthGroup` | Are we on login or register? |
| `inTabsGroup` | Are we inside the (tabs) group? |
| `!session && inTabsGroup && <Redirect href="/login" />` | **Not logged in + on the tabs → send to login.** |
| `session && inAuthGroup && <Redirect href="/(tabs)" />` | **Logged in + on login/register → send to the tabs.** |

> 💡 **We kept a SINGLE `<Stack>` with all screens registered.** This matter is important: Phase 2 discovered that switching between **two different `<Stack>` elements** fails in Expo Go. So we still use one Stack and just layer `<Redirect>` children on top. Auth logic and navigation param handling beyond this redirect were **not** touched.

---

## 8. FILES CHANGED — SUMMARY

| File | Changed | What |
|---|---|---|
| `constants/colors.ts` | Rewritten | New kiosk token set (+ `warning`, `success`, `danger`) |
| `components/AppButton.tsx` | Restyled | Flat hairline buttons; removed shadow; API unchanged |
| `app/login.tsx` | Restyled | Headings, inputs, error use new tokens; logic untouched |
| `app/register.tsx` | Restyled | Same + role chips flattened; logic untouched |
| `app/(tabs)/index.tsx` | Restyled | Left-aligned, token colors |
| `app/(tabs)/_layout.tsx` | Restyled | Tab bar uses tokens (removed dark theme) |
| `app/_layout.tsx` | Logic | Added auth-based `<Redirect>` + loading state |

**Untouched on purpose:** Supabase auth logic, business logic, navigation param handling (other than the layout redirect), `lib/database.ts`, `lib/auth.ts`, `lib/profiles.ts`, `lib/attendance.ts`.

---

## 8.5. STEP-BY-STEP EXECUTION GUIDE (what to type, in order)

> This is a **visual redesign** — no new logic, no new dependencies. Edit the files in this order. Most changes are replacing color strings/values with token names.

### Step 1 — `constants/colors.ts` (Section 2)
Replace the palette with the kiosk token set (`bg`, `ink`, `grey-blue`, `green`, `amber`, `hairline`, `danger` + the new `warning`/`success`/`danger` aliases). Keep the OLD key names (`background`, `card`, `primary`, `textPrimary`, `textSecondary`, `border`, `danger`, ...) so existing screens don't break — just point them at the new values.

### Step 2 — `components/AppButton.tsx` (Section 3)
Flatten the button: remove `shadow*` styles, use a **1px hairline border** and radius `10`, green fill for `primary`. Do NOT change the `AppButton` props/API (`title`, `icon`, `theme`, `onPress`, `disabled`) — screens depend on it.

### Step 3 — `app/login.tsx` and `app/register.tsx` (Section 4)
- Replace color/heading styles with the new tokens.
- Left-align headings; make inputs `1px hairline` borders, background `card`, no shadow.

### Step 4 — `app/(tabs)/index.tsx` (Section 5)
Left-align the home content; use token colors for titles/subtitles.

### Step 5 — `app/(tabs)/_layout.tsx` (Section 6)
Remove the dark tab bar; use near-white background + green active tab via tokens.

### Step 6 — `app/_layout.tsx` — AUTH REDIRECT (Section 7)
- Wrap the `<Stack>` with the auth logic: read `useAuth()`, show a loading spinner while `loading`, otherwise `<Redirect>` based on `session` + `segments`.
- If `!session && inTabsGroup` → `<Redirect href="/login" />`.
- If `session && inAuthGroup` → `<Redirect href="/(tabs)" />`.

### Step 7 — Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors (you changed styles/redirect, not logic).

### Step 8 — Visual check (Section 9)
Run the app and tick every row of Section 9's two checklists (visual + auth redirect).

---

## 9. VERIFY / LAB CHECKLIST

### Step 1: Type check
```bash
npx tsc --noEmit
```
**Expected:** no errors.

### Step 2: Visual check (app running)
| # | Task | Done? |
|---|---|---|
| 1 | App background is warm paper (`#F7F6F2`), not blue | ☐ |
| 2 | Login/Register headings are left-aligned, strong ink | ☐ |
| 3 | Inputs have 1px hairline borders, no drop shadow | ☐ |
| 4 | Primary buttons are green with a 1px border | ☐ |
| 5 | Non-primary buttons are flat white with a hairline border | ☐ |
| 6 | Error text is red (`danger`), left-aligned | ☐ |
| 7 | Tab bar is near-white with green active tab | ☐ |
| 8 | Home screen content is left-aligned | ☐ |

### Step 3: Auth redirect check
| # | Test | Expected |
|---|---|---|
| 1 | Fresh start (not logged in) | Lands on login; can't reach tabs |
| 2 | After logging in | Goes to tabs |
| 3 | While signed in, try to open `/login` | Redirected into tabs |
| 4 | After signing out | Redirected back to login |

---

## 10. WHAT YOU SHOULD HAVE NOW

✅ A flat "kiosk/badge" visual identity (warm paper, ink, green/amber/red semantics)
✅ No drop-shadow cards — hairline borders instead
✅ Consistent shared button + tab bar using the token system
✅ Auth-based redirect with a clean loading state
✅ All existing logic and data code intact

**The app now reads like a hallway kiosk — fast, calm, and clear.** 🎉

---

*Visual identity redesign documented 2026-09-03.*
