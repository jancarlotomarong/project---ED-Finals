// Central input validation used by every form (register, profile, events).
// The database has its own CHECK constraints too — this is the first line of defence.

export function cleanText(value: string, maxLength = 200): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Returns an error message, or null when the password is acceptable. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password)) return 'Password must contain a letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain a number.';
  return null;
}

export type EventInput = {
  title: string;
  venue: string;
  description: string;
  start: Date;
  end: Date;
};

/** Returns an error message, or null when the event is valid. */
export function validateEventInput(
  input: EventInput,
  opts: { requireFutureEnd?: boolean } = {}
): string | null {
  const title = cleanText(input.title, 120);
  if (title.length < 3) return 'Event name must be at least 3 characters.';
  if (!cleanText(input.venue, 120)) return 'Venue is required.';
  if (input.description.trim().length > 500) {
    return 'Description must be 500 characters or fewer.';
  }
  if (Number.isNaN(input.start.getTime()) || Number.isNaN(input.end.getTime())) {
    return 'Please enter a valid date and time.';
  }
  if (input.start >= input.end) return 'Start time must be before end time.';
  if (opts.requireFutureEnd && input.end.getTime() < Date.now()) {
    return 'End time must be in the future.';
  }
  return null;
}
