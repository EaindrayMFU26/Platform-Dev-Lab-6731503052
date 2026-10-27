import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { timeRangeError, validateBookingChanges, validateNewBooking, type BookingInput } from './validation'
import {
  QUEUES,
  isQueueName,
  readSettings,
  routeSupportRequest,
  validateSupportRequest,
  type ModelRunner,
  type RoutingDecision,
} from './support-router'

// AI is the Workers AI binding (wrangler.jsonc). It is optional here so that a deployment
// without it still answers support requests, through the fallback. The ROUTER_* variables
// are the router's settings; see readSettings().
type Bindings = {
  DB: D1Database
  AI?: Ai
  ROUTER_MODEL?: string
  ROUTER_TIMEOUT_MS?: string
  ROUTER_MIN_CONFIDENCE?: string
}
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

  // Support tickets (assignment A6). The routing decision is stored twice: the columns staff
  // filter by, and the complete decision as JSON for auditing.
  insertTicket: `
    INSERT INTO support_tickets (id, message, equipment_id, booking_id, queue, urgency, needs_human,
                                 confidence, decision_source, decision_model, fallback_reason, decision_json)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    RETURNING *`,
  // Newest first. rowid is the insertion order, so it also orders tickets filed in the same millisecond.
  listTickets: 'SELECT * FROM support_tickets ORDER BY created_at DESC, rowid DESC',
  listTicketsInQueue: 'SELECT * FROM support_tickets WHERE queue = ?1 ORDER BY created_at DESC, rowid DESC',
  findTicket: 'SELECT * FROM support_tickets WHERE id = ?1',
  deleteTicket: 'DELETE FROM support_tickets WHERE id = ?1',

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

// A support_tickets row as stored in D1.
type TicketRow = {
  id: string
  message: string
  equipment_id: string | null
  booking_id: string | null
  queue: string
  urgency: string
  needs_human: number
  confidence: number
  decision_source: string
  decision_model: string | null
  fallback_reason: string | null
  decision_json: string
  created_at: string
}

// The complete decision lives in decision_json; the other decision columns exist for filtering.
const toTicket = (row: TicketRow) => ({
  id: row.id,
  message: row.message,
  equipmentId: row.equipment_id,
  bookingId: row.booking_id,
  decision: JSON.parse(row.decision_json) as RoutingDecision,
  createdAt: row.created_at,
})

// The Workers AI binding types each known model's input separately. The router takes the
// model id from configuration, so the binding is wrapped in the plain string interface the
// router expects. Without the binding there is no runner, and the router falls back.
function modelRunner(env: Bindings): ModelRunner | null {
  const ai = env.AI as unknown as { run(model: string, input: unknown): Promise<unknown> } | undefined
  return ai ? { run: (model, input) => ai.run(model, input) } : null
}

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
      'POST /api/support/route',
      'POST /api/support/tickets',
      'GET /api/support/tickets',
      'GET /api/support/tickets/:id',
      'DELETE /api/support/tickets/:id',
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

// ---------------------------------------------------------------------------------------
// Support requests: the AI routing capability (assignment A6)
// ---------------------------------------------------------------------------------------

// A support message is at most 2000 characters, so a valid request body is a few kilobytes.
// Anything over 16 KB is refused before it is read, which keeps a huge body from being parsed.
const SUPPORT_BODY_MAX_BYTES = 16 * 1024
app.use(
  '/api/support/*',
  bodyLimit({
    maxSize: SUPPORT_BODY_MAX_BYTES,
    onError: (c) => c.json({ error: `Request body must be at most ${SUPPORT_BODY_MAX_BYTES} bytes` }, 413),
  }),
)

// The decision on its own, nothing stored. For trying the capability and for clients that
// do their own follow-up.
app.post('/api/support/route', async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined)
  const result = validateSupportRequest(body)
  if (!result.ok) return jsonError(c, 400, result.errors.join('; '))
  return c.json(await routeSupportRequest(result.value, modelRunner(c.env), readSettings(c.env)))
})

// The downstream action: route the message and file it as a ticket in that queue.
app.post('/api/support/tickets', async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined)
  const result = validateSupportRequest(body)
  if (!result.ok) return jsonError(c, 400, result.errors.join('; '))
  const request = result.value

  const equipmentId = request.context?.equipmentId ?? null
  if (equipmentId !== null && !(await equipmentExists(c.env.DB, equipmentId))) {
    return jsonError(c, 404, `Equipment '${equipmentId}' not found`)
  }

  const decision = await routeSupportRequest(request, modelRunner(c.env), readSettings(c.env))
  const row = await c.env.DB.prepare(SQL.insertTicket)
    .bind(
      crypto.randomUUID(),
      request.message,
      equipmentId,
      request.context?.bookingId ?? null,
      decision.queue,
      decision.urgency,
      decision.needsHuman ? 1 : 0,
      decision.confidence,
      decision.source,
      decision.model,
      decision.fallbackReason,
      JSON.stringify(decision),
    )
    .first<TicketRow>()
  if (!row) throw new Error('the ticket was not stored') // INSERT ... RETURNING always returns the row
  return c.json(toTicket(row), 201)
})

app.get('/api/support/tickets', async (c) => {
  const queue = c.req.query('queue')
  if (queue !== undefined && !isQueueName(queue)) return jsonError(c, 400, `queue must be one of ${QUEUES.join(', ')}`)
  const statement = queue === undefined ? c.env.DB.prepare(SQL.listTickets) : c.env.DB.prepare(SQL.listTicketsInQueue).bind(queue)
  const { results } = await statement.all<TicketRow>()
  return c.json(results.map(toTicket))
})

app.get('/api/support/tickets/:id', async (c) => {
  const row = await c.env.DB.prepare(SQL.findTicket).bind(c.req.param('id')).first<TicketRow>()
  if (!row) return jsonError(c, 404, 'Ticket not found')
  return c.json(toTicket(row))
})

app.delete('/api/support/tickets/:id', async (c) => {
  const { meta } = await c.env.DB.prepare(SQL.deleteTicket).bind(c.req.param('id')).run()
  if (meta.changes === 0) return jsonError(c, 404, 'Ticket not found')
  return c.body(null, 204)
})

app.notFound((c) => jsonError(c, 404, `Route not found: ${c.req.method} ${c.req.path}`))

app.onError((err, c) => {
  console.error(err) // the details stay in the server log and are never sent to the client
  return jsonError(c, 500, 'Internal server error')
})

export default app
