# Phase 1 — Supabase Project Setup

> Connect the React Native application to Supabase.
> Install the client library, introduce environment variables, create the Supabase client module.

---

## 1. MODULE OBJECTIVE

**What are we building?**

We are installing the Supabase JavaScript client library and creating a module that initializes the connection to a Supabase project. This is the foundation for all future cloud features (authentication, database, security).

**Why do we need it?**

The current app uses SQLite — a database that lives entirely on one device. If the student deletes the app, all attendance data is lost. There is no way for a teacher and student to share information.

Supabase gives us:
- **PostgreSQL database** — industry-standard relational database, hosted in the cloud
- **Authentication** — real user accounts with email/password
- **Row Level Security** — database-level access rules
- **Real-time** — live data updates (future use)

**What will the student learn?**

- What Supabase is and what it provides
- What PostgreSQL is
- What a client library does
- What environment variables are
- Why secrets must never be hardcoded
- How to initialize a service in React Native

---

## 2. CURRENT STATE

Before this phase, the app had **zero cloud connectivity**:

```
QR-ATT App
    |
    v
SQLite (local file on device)
    |
    v
qr-attendance.db
    |
    v
Data stays on one device only
```

There was no `.env` file, no Supabase client, no environment variables.

---

## 3. TARGET STATE

After this phase:

```
QR-ATT App
    |
    v
Supabase Client (lib/supabase.ts)
    |
    v
Environment Variables (.env)
    |
    +--- EXPO_PUBLIC_SUPABASE_URL
    +--- EXPO_PUBLIC_SUPABASE_ANON_KEY
    |
    v
Ready to connect to Supabase Cloud
    (database and auth — not yet implemented)
```

**Important:** After Phase 1, the app will NOT yet use Supabase for data or auth. We are only installing the client library and setting up the connection configuration. The SQLite code remains fully functional.

---

## 4. FILES INVOLVED

| File | Action | Why |
|---|---|---|
| `package.json` | Modified | Add `@supabase/supabase-js` and `expo-secure-store` |
| `.env.example` | Created | Template showing required env vars (safe to commit) |
| `.env` | Created | Actual values (gitignored, never committed) |
| `.gitignore` | Modified | Ensure `.env` is ignored |
| `lib/supabase.ts` | Created | Supabase client initialization module |
| `lib/database.ts` | Unchanged | SQLite code stays working |
| All screens | Unchanged | No screen changes this phase |

---

## 5. CONCEPT EXPLANATIONS

### What is Supabase?

Supabase is an open-source backend-as-a-service (BaaS). It provides:

1. **PostgreSQL Database** — A powerful relational database hosted in the cloud
2. **Authentication** — User registration, login, session management
3. **Row Level Security (RLS)** — Security rules at the database level
4. **Real-time** — Live data subscriptions
5. **Storage** — File storage (not used in this project)

Think of it as: **Firebase, but with a real SQL database instead of NoSQL.**

### What is PostgreSQL?

PostgreSQL is the world's most advanced open-source relational database. It:
- Uses SQL (Structured Query Language)
- Supports tables, foreign keys, constraints, indexes
- Handles complex queries efficiently
- Is used by companies of all sizes
- Is the database engine behind Supabase

### What is a Client Library?

A client library is a JavaScript/TypeScript package that:
- Knows how to talk to the Supabase API
- Handles HTTP requests, authentication headers, token refresh
- Provides a simple API for your code to use

Instead of writing raw HTTP requests:
```ts
// WITHOUT client library (hard, error-prone)
fetch('https://xxx.supabase.co/rest/v1/events', {
  headers: {
    'apikey': 'xxx',
    'Authorization': `Bearer ${token}`
  }
})
```

You write:
```ts
// WITH client library (simple, safe)
const { data, error } = await supabase.from('events').select('*')
```

### What are Environment Variables?

Environment variables are configuration values that:
- Are set OUTSIDE your source code
- Change between environments (development, staging, production)
- Should NEVER contain secrets in client-side code
- Are loaded at runtime

In Expo, variables prefixed with `EXPO_PUBLIC_` are automatically available via `process.env`.

### Why Not Hardcode Credentials?

```ts
// BAD — anyone can read your source code and steal your keys
const supabaseUrl = 'https://abc123.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIs...';

// GOOD — values stored outside source code
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
```

The `anon` key is safe to include in a mobile app (it is public by design), but hardcoding it:
- Makes it impossible to use different keys per environment
- Violates security best practices
- Makes key rotation difficult

### What is expo-secure-store?

`expo-secure-store` provides secure, encrypted storage on the device. We use it to store Supabase authentication tokens. This is more secure than AsyncStorage because:
- Data is encrypted at rest
- Uses platform-specific secure storage (Keychain on iOS, EncryptedSharedPreferences on Android)
- Tokens persist across app restarts

### Expo SDK Version Compatibility

**This is critical.** Every Expo SDK version has specific compatible versions of expo packages. Using the wrong version will cause errors.

```
Expo SDK Version    Compatible expo-secure-store
-----------------   ----------------------------
SDK 52              ~14.0.x
SDK 53              ~14.0.x
SDK 54              ~15.0.x  <-- YOUR VERSION
SDK 55              ~16.0.x (future)
```

**Rule:** Always use `npx expo install` instead of `npm install` for Expo packages. This automatically selects the correct version.

```bash
# WRONG — may install incompatible version
npm install expo-secure-store

# CORRECT — installs compatible version
npx expo install expo-secure-store
```

**How to check compatibility:**

```bash
npx expo install --check
```

This shows any packages that need updating for your SDK version.

**Your project uses Expo SDK 54**, so:
- `expo-secure-store` must be `~15.0.x`
- `expo-camera` must be `~17.0.x`
- `expo-sqlite` must be `~16.0.x`

If you see version mismatch errors, run:

```bash
npx expo install --fix
```

This automatically updates packages to compatible versions.

---

## 6. SUPABASE DASHBOARD WALKTHROUGH

This section shows you exactly what the Supabase dashboard looks like and where to find each value. Read this before starting the execution steps.

### 6.1. Supabase Homepage

Go to `https://supabase.com`. You will see:

```
+------------------------------------------+
|  supabase                         [Sign in] |
|                                          |
|  The open source Firebase alternative    |
|                                          |
|  [Start your project]                   |
+------------------------------------------+
```

Click **"Start your project"**.

---

### 6.2. Sign In Page

```
+------------------------------------------+
|  Sign in to Supabase                     |
|                                          |
|  [Sign in with GitHub]  <-- Click this   |
|                                          |
|  or                                      |
|                                          |
|  Email: _______________                  |
|  Password: _____________                 |
|  [Sign In]                              |
+------------------------------------------+
```

**Recommended:** Use "Sign in with GitHub" — it is the easiest method.

If you do not have a GitHub account:
1. Go to https://github.com
2. Click "Sign up"
3. Create a free account
4. Then return to Supabase and sign in with GitHub

---

### 6.3. Dashboard After Login

After signing in, you see the main dashboard:

```
+------------------------------------------+
|  Dashboard                               |
|                                          |
|  Welcome back, [Your Name]!             |
|                                          |
|  [New project]  <-- Click this           |
|                                          |
|  Your Organizations:                     |
|  - your-username                         |
+------------------------------------------+
```

Click **"New project"**.

---

### 6.4. Create New Project Form

```
+------------------------------------------+
|  Create a new project                     |
|                                          |
|  Organization: [your-username ▼]        |
|  Project name: [qr-att          ]        |
|  Database password: [•••••••••••]        |
|  Region: [Southeast Asia (Singapore) ▼]  |
|                                          |
|  [Create new project]                    |
+------------------------------------------+
```

Fill in:
- **Project name:** `qr-att`
- **Database password:** Create a strong password and **SAVE IT**
- **Region:** Choose the one closest to you

Click **"Create new project"** and wait 1-2 minutes.

---

### 6.5. Project Dashboard (Home)

Once created, you see the project home:

```
+------------------------------------------+
|  Project: qr-att                         |
|                                          |
|  [Home] [SQL Editor] [Table Editor] ...  |
|                                          |
|  Welcome to your new project!            |
|  Project URL: https://xxx.supabase.co   |
|  Status: Healthy                        |
+------------------------------------------+
```

---

### 6.6. Finding Your Project URL

**Option A: From the Home page**
- Look for "Project URL" on the home page
- It shows: `https://abcdefghij.supabase.co`

**Option B: From Settings (more reliable)**
1. Click **"Settings"** (gear icon in left sidebar)
2. Click **"API"** under Project Settings
3. Find **"Project URL"**
4. Click the copy icon

```
+------------------------------------------+
|  Settings > API                          |
|                                          |
|  Project URL                             |
|  +----------------------------------+    |
|  | https://abcdefghijklmnop.supabase.co | [Copy] |
|  +----------------------------------+    |
|                                          |
|  Project API keys                        |
|  anon public    [Copy]                  |
|  service_role   [DO NOT USE]            |
+------------------------------------------+
```

---

### 6.7. Finding Your Anon Key

On the same Settings > API page:

1. Scroll to **"Project API keys"**
2. Find the row labeled **`anon` `public`**
3. Click the copy icon

```
+------------------------------------------+
|  Project API keys                        |
|                                          |
|  Name       Role        Key              |
|  ---------  ----------  ---------------- |
|  anon       public      eyJhbGci... [Copy]|
|  service    service_role eyJhbGci...      |
+------------------------------------------+
```

**Copy the `anon` key only.** Do NOT copy `service_role`.

---

### 6.8. What Your .env File Should Look Like

After copying both values, your `.env` file should look like this:

```bash
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjA5OTI0NSwiZXhwIjoyMDI3NjM1MjQ1fQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

**NOT like this:**
```bash
# WRONG - has quotes
EXPO_PUBLIC_SUPABASE_URL="https://abcdefghijklmnop.supabase.co"

# WRONG - has spaces
EXPO_PUBLIC_SUPABASE_URL = https://abcdefghijklmnop.supabase.co

# WRONG - using service_role key
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ... (service_role key)
```

---

## 7. BEFORE/AFTER COMPARISON

### package.json

```diff
  "dependencies": {
+   "@supabase/supabase-js": "^2.114.0",
    "expo": "~54.0.35",
+   "expo-secure-store": "~15.0.8",
    "expo-sqlite": "~16.0.10",
```

| Previous | New | Why |
|---|---|---|
| No Supabase package | `@supabase/supabase-js` ^2.114.0 | Client library to talk to Supabase |
| No secure storage | `expo-secure-store` ~15.0.8 | Secure token persistence (compatible with Expo SDK 54) |

### .gitignore

```diff
  # local env files
- .env*.local
+ .env
+ .env*.local
```

| Previous | New | Why |
|---|---|---|
| Only `.env*.local` ignored | `.env` also ignored | Prevents committing actual credentials |

### lib/supabase.ts (NEW FILE)

```typescript
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

---

## 8. LINE-BY-LINE EXPLANATION

```typescript
import { createClient } from '@supabase/supabase-js';
```
- Imports the `createClient` function from the Supabase library
- This function creates a configured Supabase client instance

```typescript
import * as SecureStore from 'expo-secure-store';
```
- Imports Expo's secure storage module
- This will be used to persist authentication tokens securely

```typescript
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};
```
- Creates an adapter object that matches the interface Supabase expects
- Supabase needs a `getItem`, `setItem`, and `removeItem` function for token storage
- This adapter wraps Expo's async secure store methods
- The result: Supabase auth tokens are stored encrypted on the device

```typescript
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
```
- Reads environment variables set in the `.env` file
- `process.env` accesses environment variables at runtime
- The `!` (non-null assertion) tells TypeScript these values exist
- In production, you would add validation, but for learning purposes this is clear

```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```
- Creates and exports the Supabase client instance
- `createClient(url, key, options)` — three arguments:
  1. **URL** — Your Supabase project URL
  2. **Anon Key** — Your public API key (safe for client apps)
  3. **Options** — Configuration object
- Auth options:
  - `storage: ExpoSecureStoreAdapter` — Use secure storage for tokens
  - `autoRefreshToken: true` — Automatically refresh expired tokens
  - `persistSession: true` — Remember the user across app restarts
  - `detectSessionInUrl: false` — Not needed for React Native (no URL bar)

---

## 9. TESTING

### How to Test This Module

1. **Start Expo:**
   ```bash
   npx expo start
   ```

2. **Verify no errors on startup:**
   - The app should start normally
   - Home screen should display as before
   - All tabs should work as before

3. **Verify TypeScript compiles:**
   ```bash
   npx tsc --noEmit
   ```
   - Should complete with no errors

4. **Verify .env is gitignored:**
   ```bash
   git status
   ```
   - `.env` should NOT appear in tracked files
   - `.env.example` SHOULD appear (it is safe to commit)

5. **Verify dependencies installed:**
   ```bash
   npm ls @supabase/supabase-js
   npm ls expo-secure-store
   ```
   - Both should show installed versions

---

## 10. EXPECTED RESULT

- App starts without errors
- Home screen displays correctly
- All 5 tabs function as before
- No visual changes to the application
- `lib/supabase.ts` exists and exports `supabase`
- `.env` file contains placeholder values
- `.env.example` file exists as a template
- `.gitignore` ignores `.env`
- TypeScript compiles cleanly

---

## 11. COMMON ERRORS

### Error: "Cannot find module '@supabase/supabase-js'"

**Cause:** Package not installed.

**Fix:** Run `npm install @supabase/supabase-js`

### Error: "Cannot find module 'expo-secure-store'"

**Cause:** Package not installed.

**Fix:** Run `npm install expo-secure-store`

### Error: "supabaseUrl is undefined"

**Cause:** `.env` file missing or not loaded.

**Fix:**
1. Check `.env` file exists in project root
2. Check variable names match exactly: `EXPO_PUBLIC_SUPABASE_URL`
3. Restart Expo after creating/modifying `.env`

### Error: TypeScript error on `process.env`

**Cause:** TypeScript doesn't know about Expo environment variables.

**Fix:** This is expected. Expo injects these at runtime. The `!` assertion handles it. If you see a type error, ensure your `tsconfig.json` extends `expo/tsconfig.base`.

---

## 12. SECURITY NOTES

### What is Safe to Include in a Mobile App

The **anon key** (public API key) is designed to be exposed in client applications. It is safe to include because:
- Row Level Security (Phase 5) controls what data it can access
- It cannot perform admin operations
- It is public by design in Supabase's architecture

### What Should NEVER Be in a Mobile App

The **service role key** provides unrestricted access to your database. NEVER include it in:
- Source code
- Environment variables in client apps
- Any file that ships to users

### The `.env` File

- `.env` contains your actual credentials — never commit it
- `.env.example` contains placeholder values — safe to commit
- `.gitignore` ensures `.env` is not tracked by Git

---

## 13. DOCUMENTATION

After completing this phase:
- Created `docs/01-project-setup.md` (this document)
- Updated `docs/migration-log.md` with Phase 1 entry

---

## 14. STEP-BY-STEP EXECUTION GUIDE

This section provides exact commands and actions to implement Phase 1 from scratch. Follow each step in order.

### Prerequisites

Before starting, ensure you have:
- Node.js installed (v18 or later)
- npm installed
- The QR-ATT project cloned and working
- A terminal/command prompt open
- A code editor (VS Code recommended)

---

### Step 1: Open the Project Terminal

Open your terminal and navigate to the project folder:

```bash
cd path/to/QR-APP-main
```

Verify you are in the correct directory by listing files:

```bash
ls
```

You should see: `app/`, `components/`, `constants/`, `lib/`, `package.json`, etc.

---

### Step 2: Install Supabase Client Library

Run the following command to install the Supabase JavaScript client:

```bash
npm install @supabase/supabase-js
```

**What this does:**
- Downloads the `@supabase/supabase-js` package from npm
- Adds it to `package.json` under `dependencies`
- Creates an entry in `package-lock.json`
- Downloads the package to `node_modules/`

**Verify installation:**

```bash
npm ls @supabase/supabase-js
```

Expected output:
```
`-- @supabase/supabase-js@2.114.0
```

---

### Step 3: Install Secure Storage

Run the following command to install Expo's secure storage:

```bash
npx expo install expo-secure-store
```

**IMPORTANT:** Always use `npx expo install` instead of `npm install` for Expo packages. This ensures you get the version compatible with your Expo SDK version.

**What this does:**
- Downloads `expo-secure-store` from npm
- Adds it to `package.json`
- Provides encrypted storage for auth tokens
- Automatically selects the correct version for your Expo SDK

**Verify installation:**

```bash
npm ls expo-secure-store
```

Expected output (for Expo SDK 54):
```
`-- expo-secure-store@15.0.8
```

---

### Step 4: Verify package.json Updated Correctly

Open `package.json` in your editor. Verify these two lines exist under `dependencies`:

```json
"@supabase/supabase-js": "^2.114.0",
"expo-secure-store": "~15.0.8",
```

**Note:** The `~` prefix means "compatible with 15.0.8" (allows patch updates). The `^` prefix means "compatible with 2.114.0" (allows minor updates). Both are correct for these packages.

If they are missing, repeat Steps 2 and 3.

---

### Step 5: Create a Supabase Account (Free)

Before we can connect the app to Supabase, you need a Supabase account and project.

**5.1. Open the Supabase Website**

Open your browser and go to:

```
https://supabase.com
```

**5.2. Click "Start your project"**

You will see a button that says "Start your project" or "Sign up". Click it.

**5.3. Sign Up with GitHub**

Supabase uses GitHub for authentication:

1. Click "Sign in with GitHub"
2. If you are not logged into GitHub, you will be asked to log in
3. If you do not have a GitHub account, create one first at https://github.com
4. Authorize Supabase to access your GitHub account

**5.4. Complete Supabase Registration**

After GitHub authorization:
1. You may be asked to enter your email and create a Supabase password
2. Fill in your details
3. Verify your email if asked
4. You will be redirected to the Supabase dashboard

**What is the Supabase Dashboard?**

The dashboard is a web interface where you:
- Create and manage projects
- View your database
- Manage authentication settings
- Configure security rules

Think of it as the "control panel" for your backend.

---

### Step 6: Create a Supabase Project

After logging into the dashboard:

**6.1. Click "New Project"**

You will see a button that says "New project" or "Create a new project". Click it.

**6.2. Fill in Project Details**

You will see a form with these fields:

| Field | Value | Notes |
|---|---|---|
| **Organization** | Select your organization | If this is your first time, it will be your username |
| **Project name** | `qr-att` | Can be any name, no spaces allowed |
| **Database password** | Create a strong password | **SAVE THIS PASSWORD** — you cannot see it again |
| **Region** | Choose closest to you | e.g., "Southeast Asia (Singapore)" |

**6.3. Click "Create new project"**

Wait for the project to be created. This takes 1-2 minutes.

**While waiting, understand:**

```
Your Supabase Project Contains:

├── PostgreSQL Database    ← Where your tables will live
├── Authentication         ← Where users will sign up/log in
├── API                    ← URL your app calls to talk to the database
├── Dashboard              ← Web interface to manage everything
└── Settings               ← Project configuration
```

**6.4. Project is Ready**

When the dashboard loads, you will see your project's home page. The project is now active.

---

### Step 7: Get Your Project URL

The project URL is the web address your app uses to communicate with Supabase.

**7.1. Go to Project Settings**

In the left sidebar, scroll down and click "Settings" (gear icon).

**7.2. Click "API"**

Under Settings, click "API". You will see two important values:

1. **Project URL** — Looks like: `https://abcdefghij.supabase.co`
2. **Project API Keys** — Contains your `anon` `public` key

**7.3. Copy the Project URL**

1. Find the field labeled "Project URL"
2. Click the copy icon next to it
3. The URL looks like: `https://abcdefghij.supabase.co`
4. **Save this URL somewhere safe** — you will need it in Step 9

```
Example Project URL:
https://abcdefghijklmnop.supabase.co

NOTICE:
- It starts with https://
- It ends with .supabase.co
- The middle part is your unique project ID
```

---

### Step 8: Get Your Anon Key

The anon key is a public API key that allows your app to communicate with Supabase. It is safe to include in a mobile app.

**8.1. Find the API Keys Section**

On the same Settings > API page, scroll to "Project API keys".

**8.2. Copy the Anon Key**

1. Find the row labeled `anon` `public`
2. Click the copy icon next to the key value
3. The key looks like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3Mi...`
4. **Save this key somewhere safe** — you will need it in Step 9

```
Example Anon Key (partial):
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjA5...

NOTICE:
- It starts with "eyJ" (this is a JWT token)
- It is very long
- It is PUBLIC — safe for client apps
- NEVER use the "service_role" key in a mobile app
```

**8.3. DO NOT Copy the Service Role Key**

You may also see a key labeled `service_role`. This key has unrestricted access to your database. **NEVER use it in a mobile app.** Only use the `anon` key.

---

### Step 9: Create the .env.example File

Now that you understand what credentials are needed, create the template file.

Create a new file named `.env.example` in the project root (same level as `package.json`).

Paste the following content:

```bash
# Supabase Configuration
# Copy this file to .env and fill in your actual values.
# NEVER commit .env to version control.

EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Save the file.

---

### Step 10: Create the .env File with Real Credentials

This is where you put your actual Supabase credentials.

Create a new file named `.env` in the project root.

Paste the following content, replacing the placeholder values with your real credentials from Steps 7 and 8:

```bash
# Supabase Configuration
# These values come from your Supabase dashboard > Settings > API
# NEVER commit this file to version control.

EXPO_PUBLIC_SUPABASE_URL=https://your-actual-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key-here
```

**Replace:**

| Placeholder | Replace With |
|---|---|
| `https://your-actual-project-id.supabase.co` | Your Project URL from Step 7.3 |
| `your-actual-anon-key-here` | Your Anon Key from Step 8.2 |

**Example of a correctly filled .env file:**

```bash
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjA5OTI0NSwiZXhwIjo\
yMDI3NjM1MjQ1fQ.example-signature-here
```

Save the file.

**IMPORTANT:**
- Do NOT add quotes around the values
- Do NOT add spaces after the `=`
- The URL must start with `https://`
- The key must start with `eyJ`

---

### Step 11: Update .gitignore

Open `.gitignore` in your editor.

Find this section:

```gitignore
# local env files
.env*.local
```

Change it to:

```gitignore
# local env files
.env
.env*.local
```

**What this does:**
- Adds `.env` to the list of files Git should ignore
- Prevents accidental commit of your actual credentials
- `.env.example` is NOT ignored (it is safe to share)

Save the file.

---

### Step 12: Create the Supabase Client Module

This is the main file that initializes the Supabase connection.

Create a new file: `lib/supabase.ts`

Paste the following content exactly:

```typescript
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

Save the file.

**Verify the file exists:**

```bash
ls lib/
```

You should see: `database.ts` and `supabase.ts`

---

### Step 13: Run TypeScript Check

Verify the new code compiles without type errors:

```bash
npx tsc --noEmit
```

**Expected result:** No output (means no errors).

**If you see errors:**
- Check that `lib/supabase.ts` was saved correctly
- Check that `@supabase/supabase-js` and `expo-secure-store` are installed
- Re-run `npm install` to ensure all dependencies are present

---

### Step 14: Verify the App Starts

Start the Expo development server:

```bash
npx expo start
```

**What to check:**
1. The server starts without errors
2. Scan the QR code with your phone (or press `a` for Android emulator, `i` for iOS simulator)
3. The app loads and shows the Home screen
4. All 5 tabs work (Home, Scan, History, Teacher, Profile)
5. No red error screens

**If the app fails to start:**
- Stop the server (Ctrl+C)
- Clear cache: `npx expo start -c`
- Try again

---

### Step 15: Verify .env is Gitignored

If your project uses Git, run:

```bash
git status
```

**Expected result:**
- `.env` should NOT appear in the "Changes to be committed" or "Untracked files" list
- `.env.example` MAY appear (this is safe — it contains no real credentials)

If `.env` appears in the list, your `.gitignore` update in Step 11 was not saved correctly. Re-check the file.

---

### Step 16: Verify File Structure

Confirm all new files exist:

```bash
ls -la .env .env.example lib/supabase.ts
```

Or on Windows:

```bash
dir .env
dir .env.example
dir lib\supabase.ts
```

All three files should exist.

---

### Step 17: Summary Checklist

After completing all steps, verify:

| # | Check | Status |
|---|---|---|
| 1 | `@supabase/supabase-js` installed | `npm ls @supabase/supabase-js` shows version |
| 2 | `expo-secure-store` installed (correct version) | `npm ls expo-secure-store` shows `15.0.8` |
| 3 | Supabase account created | Logged into https://supabase.com/dashboard |
| 4 | Supabase project created | Project "qr-att" is active |
| 5 | Project URL copied | Saved from Settings > API |
| 6 | Anon key copied | Saved from Settings > API |
| 7 | `.env.example` created | File exists in project root |
| 8 | `.env` created with real credentials | File exists, values filled in |
| 9 | `.gitignore` updated | `.env` line exists in `.gitignore` |
| 10 | `lib/supabase.ts` created | File exists in `lib/` folder |
| 11 | TypeScript compiles | `npx tsc --noEmit` shows no errors |
| 12 | App starts | Home screen loads, all tabs work |

---

### Step 18: What to Do If Something Goes Wrong

**Problem: "npm install" fails**
- Check your internet connection
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again

**Problem: Cannot create Supabase account**
- Ensure you have a GitHub account (https://github.com)
- Try a different browser
- Check if Supabase is experiencing downtime: https://status.supabase.com

**Problem: Supabase project won't create**
- Try a different region
- Ensure your email is verified
- Wait a few minutes and try again

**Problem: Cannot find Project URL or Anon Key**
- Go to your project dashboard
- Click "Settings" (gear icon in left sidebar)
- Click "API"
- Scroll to find "Project URL" and "Project API keys"

**Problem: TypeScript errors after creating lib/supabase.ts**
- Ensure you copied the code exactly as shown
- Ensure both packages are installed
- Try: `npx expo install --fix`

**Problem: App shows red error screen**
- Stop Expo, clear cache: `npx expo start -c`
- If still failing, check the error message for which file is causing the problem

**Problem: ".env" not found by process.env**
- Ensure the file is named exactly `.env` (not `.env.txt` or `.env.local`)
- Ensure it is in the project root (same folder as `package.json`)
- Restart Expo after creating/modifying `.env`
- Check that values don't have quotes around them

---

*This phase was completed on 2026-09-03.*
*Two new packages were installed: @supabase/supabase-js and expo-secure-store.*
*One new file was created: lib/supabase.ts.*
*No existing application code was modified.*
