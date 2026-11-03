import { supabase } from "./supabase";

export type Role = "student" | "teacher" | "admin";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  student_number: string | null;
  program: string | null;
  section: string | null;
  department: string | null;
  is_active: boolean;
};

export type ProfileResult = {
  profile: Profile | null;
  /** Human-readable reason when profile is null (shown on the fallback screen). */
  error: string | null;
};

// Turn whatever the database returned into a complete Profile object.
// Using select('*') + defaults means the app still works even if an
// optional column (student_number, is_active, ...) is not there yet.
function normalize(row: any): Profile {
  return {
    id: row.id,
    email: row.email ?? "",
    full_name: row.full_name ?? null,
    role: (row.role ?? "student") as Role,
    student_number: row.student_number ?? null,
    program: row.program ?? null,
    section: row.section ?? null,
    department: row.department ?? null,
    is_active: row.is_active ?? true,
  };
}

async function selectProfile(userId: string) {
  return supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
}

/**
 * Loads the profile and tells you WHY it failed if it did.
 * 1) normal select
 * 2) if no row exists -> ask the database to create it (ensure_my_profile)
 * 3) select again
 */
export async function fetchProfile(userId: string): Promise<ProfileResult> {
  const first = await selectProfile(userId);

  if (first.error) {
    console.warn("[profile] select failed:", first.error);
    return {
      profile: null,
      error: `Could not read profile: ${first.error.message}${
        first.error.code ? ` (${first.error.code})` : ""
      }`,
    };
  }

  if (first.data) return { profile: normalize(first.data), error: null };

  // No row -> try to self-heal
  console.warn(
    "[profile] no profile row for user, calling ensure_my_profile()",
  );
  const ensured = await supabase.rpc("ensure_my_profile");

  if (ensured.error) {
    console.warn("[profile] ensure_my_profile failed:", ensured.error);
    return {
      profile: null,
      error:
        `No profile row exists and it could not be created: ${ensured.error.message}` +
        (ensured.error.code ? ` (${ensured.error.code})` : "") +
        ". Run fix_profiles_full.sql in the Supabase SQL Editor.",
    };
  }

  const second = await selectProfile(userId);
  if (second.error || !second.data) {
    return {
      profile: null,
      error:
        second.error?.message ??
        "Profile row still not visible after creating it (check Row Level Security policies).",
    };
  }

  return { profile: normalize(second.data), error: null };
}

/** Backwards compatible helper used elsewhere in the app. */
export async function getProfile(userId: string): Promise<Profile | null> {
  return (await fetchProfile(userId)).profile;
}

export type ProfileUpdates = {
  full_name?: string;
  student_number?: string | null;
  program?: string | null;
  section?: string | null;
  department?: string | null;
};

// NOTE: role / is_active are intentionally NOT editable here.
// The database trigger rejects them unless the caller is an admin.
export async function updateProfile(
  userId: string,
  updates: ProfileUpdates,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);
  return { error: error?.message ?? null };
}
