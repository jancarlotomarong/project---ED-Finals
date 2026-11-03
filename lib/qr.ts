// The QR code only carries the event CODE. Everything else
// (is the event open? has it started? is it a duplicate?) is checked
// on the server by record_attendance(), so a forged QR cannot cheat.

export type QRPayload = {
  v: 1;
  event: string;
};

const EVENT_CODE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function buildQRPayload(eventCode: string): string {
  const payload: QRPayload = { v: 1, event: eventCode };
  return JSON.stringify(payload);
}

export type ParseQRResult =
  | { ok: true; payload: QRPayload }
  | { ok: false; message: string };

export function parseQRPayload(raw: string): ParseQRResult {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'This is not a valid attendance QR code.' };
  }

  if (
    !parsed ||
    parsed.v !== 1 ||
    typeof parsed.event !== 'string' ||
    !EVENT_CODE_PATTERN.test(parsed.event)
  ) {
    return { ok: false, message: 'This is not a valid attendance QR code.' };
  }

  return { ok: true, payload: { v: 1, event: parsed.event } };
}
