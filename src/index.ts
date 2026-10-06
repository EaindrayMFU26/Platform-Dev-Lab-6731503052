import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { timeRangeError, validateBookingChanges, validateNewBooking, type BookingInput } from './validation'

type Bindings = { DB: D1Database }
type AppContext = Context<{ Bindings: Bindings }>

type Equipment = { id: string; name: string; location: string }

// A bookings row as stored in D1 (snake_case columns).
type BookingRow = {
  id: string
  equipment_id: string
  borrower_name: string
  start_at: string
  end_at: string
  purpose: string
  created_at: string
  updated_at: string
}

// Every statement is a fixed string. Request data reaches the database only through
// .bind(), which sends it as a value and never as SQL text, so it cannot change a query.
const SQL = {
  listEquipment: 'SELECT id, name, location FROM equipment ORDER BY id',
  findEquipment: 'SELECT id FROM equipment WHERE id = ?1',
  listBookings: 'SELECT * FROM bookings ORDER BY start_at, id',
  findBooking: 'SELECT * FROM bookings WHERE id = ?1',
  deleteBooking: 'DELETE FROM bookings WHERE id = ?1',

  // Two bookings of the same equipment overlap when each one starts before the other
  // ends. The check and the write are one statement, so two simultaneous requests cannot
  // both take the slot: the second one finds the first one's row and writes nothing.
  insertBooking: `
    INSERT INTO bookings (id, equipment_id, borrower_name, start_at, end_at, purpose)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6
    WHERE NOT EXISTS (
      SELECT 1 FROM bookings
      WHERE equipment_id = ?2 AND start_at < ?5 AND end_at > ?4
    )
    RETURNING *`,

  // The same guard for updates, ignoring the booking that is being updated.
  updateBooking: `
    UPDATE bookings
    SET equipment_id = ?2, borrower_name = ?3, start_at = ?4, end_at = ?5, purpose = ?6,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?1
      AND NOT EXISTS (
        SELECT 1 FROM bookings AS other
        WHERE other.equipment_id = ?2 AND other.id <> ?1
          AND other.start_at < ?5 AND other.end_at > ?4
      )
    RETURNING *`,

  // Only used to explain a 409: which existing booking is in the way.
  findOverlap: `
    SELECT * FROM bookings
    WHERE id <> ?1 AND equipment_id = ?2 AND start_at < ?4 AND end_at > ?3
    ORDER BY start_at
    LIMIT 1`,
}

// Database row -> the camelCase shape promised by the API contract.
const toBooking = (row: BookingRow) => ({
  id: row.id,
  equipmentId: row.equipment_id,
  borrowerName: row.borrower_name,
  startAt: row.start_at,
  endAt: row.end_at,
  purpose: row.purpose,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

// Every error leaves the API in the one shape the contract defines: { "error": "..." }.
const jsonError = (c: AppContext, status: 400 | 404 | 409 | 500, message: string) =>
  c.json({ error: message }, status)

async function equipmentExists(db: D1Database, equipmentId: string): Promise<boolean> {
  return (await db.prepare(SQL.findEquipment).bind(equipmentId).first()) !== null
}

async function conflictMessage(
  db: D1Database,
  bookingId: string,
  booking: Pick<BookingInput, 'equipmentId' | 'startAt' | 'endAt'>,
): Promise<string> {
  const other = await db
    .prepare(SQL.findOverlap)
    .bind(bookingId, booking.equipmentId, booking.startAt, booking.endAt)
    .first<BookingRow>()
  const when = other ? `from ${other.start_at} to ${other.end_at}` : 'during the requested time'
  return `Equipment '${booking.equipmentId}' is already booked ${when}`
}

const app = new Hono<{ Bindings: Bindings }>()

// A browser client (the frontend tester) runs on a different origin, so every response,
// errors and unknown routes included, must carry CORS headers, and the preflight OPTIONS
// request must be answered. Any origin is allowed because the API uses no cookies or
// credentials.
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], maxAge: 600 }))

// The Base API URL is the link people open first, so it answers with a short index
// instead of "route not found".
const index = (c: AppContext) =>
  c.json({
    name: 'Campus Equipment Booking API',
    baseUrl: new URL('/api', c.req.url).href,
    endpoints: [
      'GET /api/equipment',
      'GET /api/bookings',
      'GET /api/bookings/:id',
      'POST /api/bookings',
      'PATCH /api/bookings/:id',
      'DELETE /api/bookings/:id',
    ],
  })
app.get('/', index)
app.get('/api', index)
app.get('/api/', index)

app.get('/api/equipment', async (c) => {
  const { results } = await c.env.DB.prepare(SQL.listEquipment).all<Equipment>()
  return c.json(results)
})

app.get('/api/bookings', async (c) => {
  const { results } = await c.env.DB.prepare(SQL.listBookings).all<BookingRow>()
  return c.json(results.map(toBooking))
})

app.get('/api/bookings/:id', async (c) => {
  const row = await c.env.DB.prepare(SQL.findBooking).bind(c.req.param('id')).first<BookingRow>()
  if (!row) return jsonError(c, 404, 'Booking not found')
  return c.json(toBooking(row))
})

app.post('/api/bookings', async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined) // not JSON: rejected by the validator
  const result = validateNewBooking(body)
  if (!result.ok) return jsonError(c, 400, result.errors.join('; '))
  const booking = result.value

  if (!(await equipmentExists(c.env.DB, booking.equipmentId))) {
    return jsonError(c, 404, `Equipment '${booking.equipmentId}' not found`)
  }

  const id = crypto.randomUUID()
  const row = await c.env.DB.prepare(SQL.insertBooking)
    .bind(id, booking.equipmentId, booking.borrowerName, booking.startAt, booking.endAt, booking.purpose)
    .first<BookingRow>()
  if (!row) return jsonError(c, 409, await conflictMessage(c.env.DB, id, booking))

  return c.json(toBooking(row), 201)
})

app.patch('/api/bookings/:id', async (c) => {
  const id = c.req.param('id')
  const body: unknown = await c.req.json().catch(() => undefined)
  const result = validateBookingChanges(body)
  if (!result.ok) return jsonError(c, 400, result.errors.join('; '))
  const changes = result.value

  const current = await c.env.DB.prepare(SQL.findBooking).bind(id).first<BookingRow>()
  if (!current) return jsonError(c, 404, 'Booking not found')

  // Apply the changes on top of the stored booking, then check the rules on the result.
  const next: BookingInput = {
    equipmentId: changes.equipmentId ?? current.equipment_id,
    borrowerName: changes.borrowerName ?? current.borrower_name,
    startAt: changes.startAt ?? current.start_at,
    endAt: changes.endAt ?? current.end_at,
    purpose: changes.purpose ?? current.purpose,
  }

  const rangeError = timeRangeError(next.startAt, next.endAt)
  if (rangeError) return jsonError(c, 400, rangeError)

  if (next.equipmentId !== current.equipment_id && !(await equipmentExists(c.env.DB, next.equipmentId))) {
    return jsonError(c, 404, `Equipment '${next.equipmentId}' not found`)
  }

  const row = await c.env.DB.prepare(SQL.updateBooking)
    .bind(id, next.equipmentId, next.borrowerName, next.startAt, next.endAt, next.purpose)
    .first<BookingRow>()
  if (!row) {
    // Nothing was written: either the booking was deleted in the meantime, or the slot is taken.
    const stillExists = await c.env.DB.prepare(SQL.findBooking).bind(id).first()
    if (!stillExists) return jsonError(c, 404, 'Booking not found')
    return jsonError(c, 409, await conflictMessage(c.env.DB, id, next))
  }

  return c.json(toBooking(row))
})

app.delete('/api/bookings/:id', async (c) => {
  const { meta } = await c.env.DB.prepare(SQL.deleteBooking).bind(c.req.param('id')).run()
  if (meta.changes === 0) return jsonError(c, 404, 'Booking not found')
  return c.body(null, 204)
})

app.notFound((c) => jsonError(c, 404, `Route not found: ${c.req.method} ${c.req.path}`))

app.onError((err, c) => {
  console.error(err) // the details stay in the server log and are never sent to the client
  return jsonError(c, 500, 'Internal server error')
})

export default app
