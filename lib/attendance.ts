import { supabase } from './supabase';
import { parseQRPayload } from './qr';
import type { CloudEvent } from './events';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

// ---------------------------------------------------------------
// Student: record attendance (QR scan)
// ---------------------------------------------------------------
export type RegisterCode =
  | 'ok'
  | 'unauthorized'
  | 'invalid_qr'
  | 'closed'
  | 'not_started'
  | 'ended'
  | 'duplicate'
  | 'error';

export type RegisterResult = {
  success: boolean;
  code: RegisterCode;
  message: string;
  eventTitle?: string;
  scannedAt?: string;
};

/**
 * EVENT: scanner detected a QR code.
 * 1) client checks the QR format (cheap, gives instant feedback)
 * 2) the database function record_attendance() does the REAL validation:
 *    role, event exists, event open, time window, duplicate.
 */
export async function registerAttendance(rawPayload: string): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, code: 'invalid_qr', message: parsed.message };
  }

  try {
    const { data, error } = await supabase.rpc('record_attendance', {
      p_event_code: parsed.payload.event,
    });
    if (error || !data) {
      return {
        success: false,
        code: 'error',
        message: error?.message ?? 'Could not reach the server. Please try again.',
      };
    }
    return data as RegisterResult;
  } catch {
    return {
      success: false,
      code: 'error',
      message: 'Network error. Check your connection and try again.',
    };
  }
}

// ---------------------------------------------------------------
// Student: own history + stats
// ---------------------------------------------------------------
export type AttendanceRecord = {
  id: string;
  eventCode: string;
  eventTitle: string;
  venue: string | null;
  scannedAt: string;
  status: AttendanceStatus;
};

export async function getAttendanceHistory(
  studentId: string
): Promise<{ data: AttendanceRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, scanned_at, status, events ( event_code, title, venue )')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error) return { data: [], error: error.message };

  const rows = ((data ?? []) as any[]).map((row) => ({
    id: row.id as string,
    eventCode: (row.events?.event_code ?? '') as string,
    eventTitle: (row.events?.title ?? 'Unknown event') as string,
    venue: (row.events?.venue ?? null) as string | null,
    scannedAt: row.scanned_at as string,
    status: row.status as AttendanceStatus,
  }));
  return { data: rows, error: null };
}

export type StudentStats = { attended: number; totalEvents: number; rate: number };

export async function getStudentStats(
  studentId: string
): Promise<{ data: StudentStats | null; error: string | null }> {
  const nowIso = new Date().toISOString();
  const [att, ev] = await Promise.all([
    supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .in('status', ['present', 'late']),
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .lte('start_time', nowIso),
  ]);

  if (att.error || ev.error) {
    return { data: null, error: (att.error ?? ev.error)!.message };
  }

  const attended = att.count ?? 0;
  const totalEvents = Math.max(ev.count ?? 0, attended);
  const rate = totalEvents === 0 ? 0 : Math.round((attended / totalEvents) * 100);
  return { data: { attended, totalEvents, rate }, error: null };
}

export async function getNextEvent(): Promise<{ event: CloudEvent | null; error: string | null }> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'open')
    .gte('end_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(1);
  if (error) return { event: null, error: error.message };
  return { event: ((data ?? [])[0] as CloudEvent | undefined) ?? null, error: null };
}

/** Event ids the student has already attended (to mark "Attended" in lists). */
export async function getAttendedEventIds(
  studentId: string
): Promise<{ ids: Set<string>; error: string | null }> {
  const { data, error } = await supabase
    .from('attendance')
    .select('event_id')
    .eq('student_id', studentId);
  if (error) return { ids: new Set(), error: error.message };
  return { ids: new Set(((data ?? []) as any[]).map((r) => r.event_id as string)), error: null };
}

// ---------------------------------------------------------------
// Teacher / Admin: attendance records
// ---------------------------------------------------------------
export type AttendanceEntry = {
  id: string;
  eventId: string;
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  studentNumber: string | null;
  scannedAt: string;
  status: AttendanceStatus;
  remarks: string | null;
};

export type EventAttendance = {
  event: CloudEvent;
  attendees: AttendanceEntry[];
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// attendance.student_id points to auth.users, so profiles are fetched
// in a second query and merged here.
async function loadEntries(
  eventIds: string[]
): Promise<{ data: AttendanceEntry[]; error: string | null }> {
  if (eventIds.length === 0) return { data: [], error: null };

  const attendanceRows: any[] = [];
  for (const ids of chunk(eventIds, 100)) {
    const { data, error } = await supabase
      .from('attendance')
      .select('id, event_id, student_id, scanned_at, status, remarks')
      .in('event_id', ids)
      .order('scanned_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    attendanceRows.push(...(data ?? []));
  }

  const studentIds = [...new Set(attendanceRows.map((a) => a.student_id as string))];
  const profileMap: Record<
    string,
    { full_name: string | null; email: string | null; student_number: string | null }
  > = {};
  for (const ids of chunk(studentIds, 100)) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, student_number')
      .in('id', ids);
    ((data ?? []) as any[]).forEach((p) => {
      profileMap[p.id] = {
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        student_number: p.student_number ?? null,
      };
    });
  }

  const entries = attendanceRows.map((a): AttendanceEntry => {
    const prof = profileMap[a.student_id];
    return {
      id: a.id,
      eventId: a.event_id,
      studentId: a.student_id,
      studentName:
        prof?.full_name || (prof?.email ? prof.email.split('@')[0] : `…${String(a.student_id).slice(-8)}`),
      studentEmail: prof?.email ?? null,
      studentNumber: prof?.student_number ?? null,
      scannedAt: a.scanned_at,
      status: a.status as AttendanceStatus,
      remarks: a.remarks ?? null,
    };
  });
  return { data: entries, error: null };
}

/** Attendance list for ONE event (event detail screen). */
export async function getEventAttendance(
  eventId: string
): Promise<{ data: AttendanceEntry[]; error: string | null }> {
  return loadEntries([eventId]);
}

/** Teacher: pass their id (own events). Admin: omit (all events). */
export async function getEventsWithAttendance(
  createdBy?: string
): Promise<{ data: EventAttendance[]; error: string | null }> {
  let query = supabase
    .from('events')
    .select('*')
    .order('start_time', { ascending: false })
    .limit(50);
  if (createdBy) query = query.eq('created_by', createdBy);

  const { data: events, error } = await query;
  if (error) return { data: [], error: error.message };

  const list = (events ?? []) as CloudEvent[];
  const { data: entries, error: entryError } = await loadEntries(list.map((e) => e.id));
  if (entryError) return { data: [], error: entryError };

  return {
    data: list.map((event) => ({
      event,
      attendees: entries.filter((a) => a.eventId === event.id),
    })),
    error: null,
  };
}

// ---------------------------------------------------------------
// Admin: correct attendance records (RLS allows admin only)
// ---------------------------------------------------------------
export async function updateAttendance(
  id: string,
  changes: { status: AttendanceStatus; remarks: string | null },
  adminId: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('attendance')
    .update({ status: changes.status, remarks: changes.remarks, updated_by: adminId })
    .eq('id', id)
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Only administrators can correct attendance.' };
  return { error: null };
}

export async function deleteAttendance(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('attendance').delete().eq('id', id).select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Only administrators can delete attendance.' };
  return { error: null };
}

/** Number of active students — the denominator for attendance percentage. */
export async function countActiveStudents(): Promise<number> {
  const { data, error } = await supabase.rpc('count_active_students');
  if (error || typeof data !== 'number') return 0;
  return data;
}

/** The signed-in student's own record for one event (or null). */
export async function getMyAttendanceForEvent(
  studentId: string,
  eventId: string
): Promise<{ record: { scannedAt: string; status: AttendanceStatus } | null; error: string | null }> {
  const { data, error } = await supabase
    .from('attendance')
    .select('scanned_at, status')
    .eq('student_id', studentId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) return { record: null, error: error.message };
  if (!data) return { record: null, error: null };
  return {
    record: { scannedAt: (data as any).scanned_at, status: (data as any).status as AttendanceStatus },
    error: null,
  };
}
