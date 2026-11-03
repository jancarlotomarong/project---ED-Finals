import { useSyncExternalStore } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { fetchProfile, type Profile, type Role } from './profiles';

// ---------------------------------------------------------------
// Tiny global auth store.
//   EVENT: Supabase fires onAuthStateChange (sign in / out / refresh)
//   HANDLER: applySession()
//   ACTION: load the profile (role) for that session
//   RESULT: every screen using useAuth() re-renders
// ---------------------------------------------------------------
type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** Why the profile could not be loaded (null when everything is fine). */
  profileError: string | null;
  loading: boolean;
};

let state: AuthState = {
  session: null,
  user: null,
  profile: null,
  profileError: null,
  loading: true,
};
const listeners = new Set<() => void>();
let applyId = 0;
let initialized = false;

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

async function applySession(session: Session | null) {
  const myId = ++applyId;

  if (!session) {
    setState({
      session: null,
      user: null,
      profile: null,
      profileError: null,
      loading: false,
    });
    return;
  }

  const { profile, error } = await fetchProfile(session.user.id);
  if (myId !== applyId) return; // a newer sign-in/out happened meanwhile

  // A deactivated account is signed out immediately.
  if (profile && !profile.is_active) {
    await supabase.auth.signOut().catch(() => {});
    if (myId !== applyId) return;
    setState({
      session: null,
      user: null,
      profile: null,
      profileError: null,
      loading: false,
    });
    return;
  }

  setState({
    session,
    user: session.user,
    profile,
    profileError: profile ? null : error,
    loading: false,
  });
}

/** Call once when the app starts: restores the saved session. */
export function initAuth() {
  if (initialized) return;
  initialized = true;

  supabase.auth
    .getSession()
    .then(({ data }) => applySession(data.session))
    .catch(() => setState({ loading: false }));

  supabase.auth.onAuthStateChange((_event, session) => {
    // Do not call Supabase directly inside this callback (can deadlock).
    setTimeout(() => {
      applySession(session);
    }, 0);
  });
}

/** Re-load the profile (used by the "Try again" button). */
export async function refreshProfile() {
  if (!state.user) return;
  const { profile, error } = await fetchProfile(state.user.id);
  setState({ profile, profileError: profile ? null : error });
}

export type SignUpDetails = {
  full_name: string;
  role: Exclude<Role, "admin">;
  student_number?: string;
  program?: string;
  section?: string;
  department?: string;
};

export async function signUp(
  email: string,
  password: string,
  details: SignUpDetails,
): Promise<{ hasSession: boolean; error: { message: string } | null }> {
  // Role + details travel as sign-up metadata; the database trigger
  // (handle_new_user) creates the profile row from them.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { ...details } },
  });
  if (error) return { hasSession: false, error: { message: error.message } };
  if (data.session) await applySession(data.session);
  return { hasSession: !!data.session, error: null };
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ error: { message: string } | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    return { error: { message: error?.message ?? "Could not sign in." } };
  }

  const { profile } = await fetchProfile(data.session.user.id);
  if (profile && !profile.is_active) {
    await supabase.auth.signOut().catch(() => {});
    return {
      error: {
        message:
          "This account has been deactivated. Please contact an administrator.",
      },
    };
  }

  await applySession(data.session);
  return { error: null };
}

export async function signOut() {
  try {
    await supabase.auth.signOut();
  } catch {
    // local session is cleared below even if the network call fails
  }
  applyId++;
  setState({
    session: null,
    user: null,
    profile: null,
    profileError: null,
    loading: false,
  });
}
