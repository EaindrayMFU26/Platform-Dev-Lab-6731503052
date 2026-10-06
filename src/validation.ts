// Validation of booking payloads. Pure functions: no database and no HTTP in here.

export type BookingInput = {
  equipmentId: string
  borrowerName: string
  startAt: string // always normalised to ISO 8601 UTC, e.g. 2026-10-20T09:00:00.000Z
  endAt: string
  purpose: string
}

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] }

// The only properties a client may send. Anything else in the body is ignored, so a
// client can never set id, createdAt or updatedAt.
const FIELDS = [
  { name: 'equipmentId', kind: 'text', maxLength: 64 },
  { name: 'borrowerName', kind: 'text', maxLength: 100 },
  { name: 'startAt', kind: 'dateTime' },
  { name: 'endAt', kind: 'dateTime' },
  { name: 'purpose', kind: 'text', maxLength: 500 },
] as const

// YYYY-MM-DDTHH:mm, optional :ss and .sss, then Z or an offset such as +07:00.
// The time zone is mandatory: a time without one is ambiguous.
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/

/** Returns the instant as ISO 8601 UTC text, or null when the value is not a real date-time. */
export function parseDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = DATE_TIME.exec(value)
  if (!match) return null
  const [, date, hours, minutes, seconds = '00', fraction = '', zone] = match

  // JavaScript quietly rolls impossible dates forward (Feb 30 becomes Mar 2). Read the
  // clock time as if it were UTC and require it to come back unchanged.
  const clock = `${date}T${hours}:${minutes}:${seconds}.${fraction.padEnd(3, '0')}`
  const asUtc = new Date(`${clock}Z`)
  if (Number.isNaN(asUtc.getTime()) || asUtc.toISOString() !== `${clock}Z`) return null

  const instant = new Date(clock + zone)
  if (Number.isNaN(instant.getTime())) return null
  const iso = instant.toISOString()
  return iso.length === 24 ? iso : null // 24 characters = four-digit year, the shape the database stores
}

/** Both arguments must already be normalised by parseDateTime. */
export function timeRangeError(startAt?: string, endAt?: string): string | null {
  return startAt !== undefined && endAt !== undefined && startAt >= endAt ? 'startAt must be before endAt' : null
}

function readFields(body: unknown, required: boolean): { fields: Partial<BookingInput>; errors: string[] } {
  // Covers malformed JSON too: the routes pass undefined when the body cannot be parsed.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { fields: {}, errors: ['Request body must be a valid JSON object'] }
  }
  const input = body as Record<string, unknown>
  const fields: Partial<BookingInput> = {}
  const errors: string[] = []

  for (const field of FIELDS) {
    const raw = input[field.name]
    if (raw === undefined) {
      if (required) errors.push(`${field.name} is required`)
    } else if (field.kind === 'dateTime') {
      const iso = parseDateTime(raw)
      if (iso) fields[field.name] = iso
      else errors.push(`${field.name} must be an ISO 8601 date-time with a time zone, e.g. 2026-10-20T09:00:00.000Z`)
    } else if (typeof raw !== 'string' || raw.trim() === '') {
      errors.push(`${field.name} must be a non-empty string`)
    } else if (raw.trim().length > field.maxLength) {
      errors.push(`${field.name} must be at most ${field.maxLength} characters`)
    } else {
      fields[field.name] = raw.trim()
    }
  }
  return { fields, errors }
}

/** POST: every field is required. */
export function validateNewBooking(body: unknown): Validated<BookingInput> {
  const { fields, errors } = readFields(body, true)
  const rangeError = timeRangeError(fields.startAt, fields.endAt)
  if (rangeError) errors.push(rangeError)
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: fields as BookingInput } // no errors means every field is present
}

/**
 * PATCH: any subset of the fields. The start/end order is checked by the route, after
 * the changes have been merged with the stored booking.
 */
export function validateBookingChanges(body: unknown): Validated<Partial<BookingInput>> {
  const { fields, errors } = readFields(body, false)
  if (errors.length === 0 && Object.keys(fields).length === 0) {
    errors.push('Provide at least one field to update: equipmentId, borrowerName, startAt, endAt, purpose')
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: fields }
}
