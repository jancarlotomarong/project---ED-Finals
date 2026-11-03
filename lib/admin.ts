import { supabase } from './supabase';
import type { Profile, Role } from './profiles';

const PROFILE_COLUMNS =
  'id, email, full_name, role, student_number, program, section, department, is_active';

export async function listUsers(): Promise<{ data: Profile[]; error: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Profile[], error: null };
}

export async function updateUser(
  id: string,
  changes: { role?: Role; is_active?: boolean }
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .update(changes)
    .eq('id', id)
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Only administrators can manage users.' };
  return { error: null };
}

export type SystemReport = {
  students: number;
  teachers: number;
  admins: number;
  inactive_users: number;
  events_total: number;
  events_open: number;
  events_closed: number;
  attendance_total: number;
  attendance_24h: number;
};

export async function getSystemReport(): Promise<{ data: SystemReport | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_system_report');
  if (error || !data) return { data: null, error: error?.message ?? 'No report available.' };
  return { data: data as SystemReport, error: null };
}
