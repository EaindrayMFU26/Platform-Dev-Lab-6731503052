// API tests: runs real curl commands against the running API and writes TEST_EVIDENCE.md.
//
//   npm run dev                              (terminal 1: start the API)
//   npm test                                 (terminal 2: http://localhost:8787/api)
//   npm test -- https://example.com/api      (any other Base API URL)
//
// The tests only use far-future dates (2030) and delete every booking they create.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE_URL = (process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:8787/api').replace(/\/+$/, '')
const EVIDENCE_FILE = fileURLToPath(new URL('../TEST_EVIDENCE.md', import.meta.url))
const QUIET = ['-s', '-S', '--max-time', '20'] // added to every command: no progress meter, never hang
const MARK = '[api-test]' // every booking created here carries this in "purpose"
const DAY = '2030-01-15'
const at = (time) => `${DAY}T${time}:00.000Z`

// Race test: separate curl processes start too far apart to collide, so that one case
// keeps many requests in flight at once with Node's fetch instead.
const RACE = { rounds: 40, parallel: 20, purpose: `${MARK} Race round` }

const booking = (equipmentId, start, end, extra = {}) => ({
  equipmentId,
  borrowerName: 'Somchai Jaidee',
  startAt: at(start),
  endAt: at(end),
  purpose: `${MARK} Class presentation`,
  ...extra,
})

// ---------------------------------------------------------------------------------------
// curl helpers
// ---------------------------------------------------------------------------------------

function curlArgs({ method = 'GET', path, json, rawBody, headers = {} }) {
  const args = ['-i']
  if (method !== 'GET') args.push('-X', method)
  args.push(BASE_URL + path)
  for (const [name, value] of Object.entries(headers)) args.push('-H', `${name}: ${value}`)
  const body = rawBody ?? (json === undefined ? undefined : JSON.stringify(json))
  if (body !== undefined) args.push('-H', 'Content-Type: application/json', '-d', body)
  return args
}

function runCurl(args) {
  return new Promise((resolve) => {
    const child = spawn('curl', [...QUIET, ...args])
    let raw = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => (raw += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => resolve({ exitCode: -1, stderr: String(error), ...parseResponse('') }))
    child.on('close', (exitCode) => resolve({ exitCode, stderr: stderr.trim(), ...parseResponse(raw) }))
  })
}

// Splits `curl -i` output into status line, headers and body.
function parseResponse(raw) {
  const text = raw.replace(/\r\n/g, '\n')
  const gap = text.indexOf('\n\n')
  const head = gap === -1 ? text : text.slice(0, gap)
  const body = gap === -1 ? '' : text.slice(gap + 2)
  const [statusLine = '', ...headerLines] = head.split('\n')
  const headers = {}
  for (const line of headerLines) {
    const colon = line.indexOf(':')
    if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim()
  }
  let json
  try {
    json = body === '' ? undefined : JSON.parse(body)
  } catch {
    json = undefined
  }
  return { status: Number(statusLine.split(' ')[1]) || 0, statusLine, headers, body, json }
}

// The command as you would type it in a bash-style shell (Git Bash, macOS, Linux).
function showCommand(args) {
  const quote = (arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`)
  let text = 'curl'
  for (let i = 0; i < args.length; i++) {
    const startsOption = args[i] === '-H' || args[i] === '-d'
    text += (startsOption ? ' \\\n  ' : ' ') + quote(args[i])
  }
  return text
}

function showResponse(res) {
  const shown = Object.entries(res.headers)
    .filter(([name]) => name === 'content-type' || name.startsWith('access-control-'))
    .map(([name, value]) => `${name}: ${value}`)
  const body = res.body.length > 900 ? `${res.body.slice(0, 900)} ... [${res.body.length} characters in total]` : res.body
  return [res.statusLine || `(no response: ${res.stderr})`, ...shown, '', body === '' ? '(empty body)' : body].join('\n')
}

// The contract: every error is JSON of the form { "error": "<message>" } and nothing else.
function errorShapeProblem(res) {
  if (!(res.headers['content-type'] ?? '').includes('application/json')) return 'error response is not JSON'
  const keys = res.json && typeof res.json === 'object' ? Object.keys(res.json) : []
  if (keys.length !== 1 || keys[0] !== 'error' || typeof res.json.error !== 'string' || res.json.error === '') {
    return 'error body is not exactly { "error": "<message>" }'
  }
  return null
}

// ---------------------------------------------------------------------------------------
// Test cases (run in order; later cases use the ids saved by earlier ones)
// ---------------------------------------------------------------------------------------

const ids = {}
const created = new Set()
const save = (key) => (res) => {
  ids[key] = res.json?.id
  if (res.json?.id) created.add(res.json.id)
}
// A case that depends on an earlier booking fails loudly if that booking was never created.
const need = (key) => {
  if (!ids[key]) throw new Error(`not run: an earlier case did not create booking "${key}"`)
  return ids[key]
}
const errorHas = (text) => (res) => res.json?.error?.includes(text) || `error message should mention "${text}"`
const origin = { Origin: 'http://localhost:5173' }
const INJECTION = "Robert'); DROP TABLE bookings;--"

const cases = [
  {
    title: 'List equipment',
    why: 'At least two equipment records exist and are returned as an array of { id, name, location }.',
    request: () => ({ path: '/equipment' }),
    expect: 200,
    check: (res) =>
      (Array.isArray(res.json) && res.json.length >= 2 && res.json.every((e) => e.id && e.name && e.location)) ||
      'expected an array of at least two { id, name, location } objects',
  },
  {
    title: 'Create a booking',
    why: 'A valid payload is stored and returned with a server-generated id.',
    request: () => ({ method: 'POST', path: '/bookings', json: booking('eq-1', '09:00', '11:00') }),
    expect: 201,
    check: (res) => {
      const sent = booking('eq-1', '09:00', '11:00')
      const same = Object.keys(sent).every((key) => res.json?.[key] === sent[key])
      return (same && typeof res.json.id === 'string') || 'response should echo every field and include an id'
    },
    after: save('a'),
  },
  {
    title: 'List bookings',
    why: 'The new booking appears in the list.',
    request: () => ({ path: '/bookings' }),
    expect: 200,
    check: (res) => (Array.isArray(res.json) && res.json.some((b) => b.id === ids.a)) || 'list should contain the new booking',
  },
  {
    title: 'Get one booking',
    why: 'A booking can be fetched by id.',
    request: () => ({ path: `/bookings/${need('a')}` }),
    expect: 200,
    check: (res) => res.json?.id === ids.a || 'wrong booking returned',
  },
  {
    title: 'Update a booking (partial)',
    why: 'PATCH changes only the fields sent. Extending the end time overlaps the booking\'s own old slot, which must not count as a conflict.',
    request: () => ({
      method: 'PATCH',
      path: `/bookings/${need('a')}`,
      json: { endAt: at('12:00'), purpose: `${MARK} Rescheduled presentation` },
    }),
    expect: 200,
    check: (res) =>
      (res.json?.endAt === at('12:00') && res.json.startAt === at('09:00') && res.json.borrowerName === 'Somchai Jaidee') ||
      'endAt should change while startAt and borrowerName stay the same',
  },
  {
    title: 'Missing required fields',
    why: 'Missing data is a client error: 400, and the message names every missing field.',
    request: () => ({ method: 'POST', path: '/bookings', json: { equipmentId: 'eq-1' } }),
    expect: 400,
    check: errorHas('borrowerName is required'),
  },
  {
    title: 'Start time not before end time',
    why: 'startAt must be before endAt.',
    request: () => ({ method: 'POST', path: '/bookings', json: booking('eq-1', '15:00', '14:00') }),
    expect: 400,
    check: errorHas('startAt must be before endAt'),
  },
  {
    title: 'Value that is not a date-time',
    why: 'startAt and endAt must be ISO 8601 date-times with a time zone.',
    request: () => ({ method: 'POST', path: '/bookings', json: booking('eq-1', '09:00', '11:00', { startAt: 'tomorrow 9am' }) }),
    expect: 400,
    check: errorHas('startAt must be an ISO 8601 date-time'),
  },
  {
    title: 'Impossible calendar date (30 February)',
    why: 'JavaScript would silently turn 30 February into 2 March. The API rejects it instead of booking the wrong day.',
    request: () => ({
      method: 'POST',
      path: '/bookings',
      json: booking('eq-1', '09:00', '11:00', { startAt: '2030-02-30T09:00:00.000Z', endAt: '2030-03-05T09:00:00.000Z' }),
    }),
    expect: 400,
    check: errorHas('startAt must be an ISO 8601 date-time'),
  },
  {
    title: 'Malformed JSON body',
    why: 'A body that cannot be parsed is a client error, not a server crash.',
    request: () => ({ method: 'POST', path: '/bookings', rawBody: '{"equipmentId": "eq-1",' }),
    expect: 400,
  },
  {
    title: 'Update that makes the time range invalid',
    why: 'The start/end rule is re-checked on update against the stored values (stored start is 09:00).',
    request: () => ({ method: 'PATCH', path: `/bookings/${need('a')}`, json: { endAt: at('08:00') } }),
    expect: 400,
    check: errorHas('startAt must be before endAt'),
  },
  {
    title: 'Update with nothing to change',
    why: 'An empty PATCH is rejected instead of silently doing nothing.',
    request: () => ({ method: 'PATCH', path: `/bookings/${need('a')}`, json: {} }),
    expect: 400,
  },
  {
    title: 'Unknown equipment',
    why: 'equipmentId must refer to existing equipment. The payload is well formed but the resource it points to does not exist: 404.',
    request: () => ({ method: 'POST', path: '/bookings', json: booking('eq-999', '09:00', '11:00') }),
    expect: 404,
    check: errorHas('eq-999'),
  },
  {
    title: 'Unknown booking id',
    why: 'Reading a booking that does not exist is 404.',
    request: () => ({ path: '/bookings/does-not-exist' }),
    expect: 404,
  },
  {
    title: 'Update an unknown booking',
    why: 'Updating a booking that does not exist is 404.',
    request: () => ({ method: 'PATCH', path: '/bookings/does-not-exist', json: { purpose: `${MARK} Nothing to update` } }),
    expect: 404,
  },
  {
    title: 'Unknown route',
    why: 'Even a wrong URL gets a JSON error, never an HTML or plain-text page.',
    request: () => ({ path: '/rooms' }),
    expect: 404,
  },
  {
    title: 'Overlapping booking (create)',
    why: 'eq-1 is booked 09:00-12:00, so 10:00-13:00 on the same equipment conflicts: 409.',
    request: () => ({ method: 'POST', path: '/bookings', json: booking('eq-1', '10:00', '13:00') }),
    expect: 409,
    check: errorHas('already booked'),
  },
  {
    title: 'Same time, different equipment',
    why: 'The overlap rule is per equipment: eq-2 is free at a time when eq-1 is taken.',
    request: () => ({ method: 'POST', path: '/bookings', json: booking('eq-2', '09:00', '11:00') }),
    expect: 201,
    after: save('b'),
  },
  {
    title: 'Back-to-back booking',
    why: 'A booking may start at the exact moment the previous one ends (12:00): the end time is exclusive.',
    request: () => ({ method: 'POST', path: '/bookings', json: booking('eq-1', '12:00', '13:00') }),
    expect: 201,
    after: save('c'),
  },
  {
    title: 'Overlapping booking (update the time)',
    why: 'Overlap is also prevented on update: moving the 12:00 booking back to 11:30 runs into the 09:00-12:00 one.',
    request: () => ({ method: 'PATCH', path: `/bookings/${need('c')}`, json: { startAt: at('11:30') } }),
    expect: 409,
    check: errorHas('already booked'),
  },
  {
    title: 'Overlapping booking (update the equipment)',
    why: 'Moving the eq-2 booking (09:00-11:00) onto eq-1 would collide with the eq-1 booking.',
    request: () => ({ method: 'PATCH', path: `/bookings/${need('b')}`, json: { equipmentId: 'eq-1' } }),
    expect: 409,
    check: errorHas('already booked'),
  },
  {
    title: 'Update to unknown equipment',
    why: 'equipmentId is validated on update as well.',
    request: () => ({ method: 'PATCH', path: `/bookings/${need('b')}`, json: { equipmentId: 'eq-999' } }),
    expect: 404,
    check: errorHas('eq-999'),
  },
  {
    title: 'Simultaneous requests for the same slot',
    why:
      'Race condition: when several people book the same free slot at the same moment, exactly one may succeed. ' +
      'The overlap check and the insert are a single SQL statement, so there is no gap between "is it free?" and "book it". ' +
      `Separate curl processes start too far apart to collide, so this one case uses Node.js fetch: ${RACE.rounds} rounds, ` +
      `each sending ${RACE.parallel} identical requests at once for a new slot.`,
    race: true,
  },
  {
    title: 'SQL injection attempt in a field',
    why: 'Values are bound as parameters, so SQL inside a value is stored as plain text and never executed.',
    request: () => ({ method: 'POST', path: '/bookings', json: booking('eq-2', '15:00', '16:00', { borrowerName: INJECTION }) }),
    expect: 201,
    check: (res) => res.json?.borrowerName === INJECTION || 'the text should be stored exactly as sent',
    after: save('d'),
  },
  {
    title: 'SQL injection attempt in the URL',
    why: "The id x' OR '1'='1 is compared as a value: it matches no booking instead of matching all of them.",
    request: () => ({ path: "/bookings/x%27%20OR%20%271%27%3D%271" }),
    expect: 404,
  },
  {
    title: 'Table intact after the injection attempts',
    why: 'The bookings table still exists and holds the injected text as an ordinary name.',
    request: () => ({ path: `/bookings/${need('d')}` }),
    expect: 200,
    check: (res) => res.json?.borrowerName === INJECTION || 'stored name should equal the text that was sent',
  },
  {
    title: 'Time zone offset is normalised to UTC',
    why: '16:00+07:00 (Thailand) is the same instant as 09:00Z. Times are stored and returned in UTC so they compare correctly.',
    request: () => ({
      method: 'POST',
      path: '/bookings',
      json: booking('eq-3', '09:00', '11:00', { startAt: `${DAY}T16:00:00+07:00`, endAt: `${DAY}T18:00:00+07:00` }),
    }),
    expect: 201,
    check: (res) => (res.json?.startAt === at('09:00') && res.json.endAt === at('11:00')) || 'times should come back as 09:00Z and 11:00Z',
    after: save('e'),
  },
  {
    title: 'CORS preflight',
    why: 'Before a JSON POST from another origin, a browser sends OPTIONS. The API must answer with the Access-Control-Allow-* headers.',
    request: () => ({
      method: 'OPTIONS',
      path: '/bookings',
      headers: { ...origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    }),
    expect: 204,
    check: (res) => {
      const methods = res.headers['access-control-allow-methods'] ?? ''
      const allowed = ['POST', 'PATCH', 'DELETE'].every((method) => methods.includes(method))
      const headersOk = (res.headers['access-control-allow-headers'] ?? '').toLowerCase().includes('content-type')
      return (res.headers['access-control-allow-origin'] === '*' && allowed && headersOk) || 'missing Access-Control-Allow-* headers'
    },
  },
  {
    title: 'CORS headers on an error response',
    why: 'Without CORS headers on errors, a browser client would see a generic network error instead of the API\'s message.',
    request: () => ({ path: '/bookings/does-not-exist', headers: origin }),
    expect: 404,
    check: (res) => res.headers['access-control-allow-origin'] === '*' || 'error response has no Access-Control-Allow-Origin',
  },
  {
    title: 'Delete a booking',
    why: 'DELETE returns 204 with an empty body.',
    request: () => ({ method: 'DELETE', path: `/bookings/${need('a')}` }),
    expect: 204,
    check: (res) => res.body === '' || '204 must not have a body',
    after: () => created.delete(ids.a),
  },
  {
    title: 'Deleted booking is gone',
    why: 'The booking really was removed.',
    request: () => ({ path: `/bookings/${need('a')}` }),
    expect: 404,
  },
  {
    title: 'Delete the same booking again',
    why: 'Repeating a DELETE changes nothing further; the booking no longer exists, so the answer is 404.',
    request: () => ({ method: 'DELETE', path: `/bookings/${need('a')}` }),
    expect: 404,
  },
]

// ---------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------

// Each round: RACE.parallel identical POSTs in flight at once, all for the same free slot.
async function runRace() {
  const url = `${BASE_URL}/bookings`
  const send = async (body) => {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      return { status: res.status, text: await res.text() }
    } catch (error) {
      return { status: 0, text: String(error) }
    }
  }

  const tally = {}
  const problems = []
  let sampleBody, sampleWin, sampleConflict
  for (let round = 0; round < RACE.rounds; round++) {
    const day = new Date(Date.UTC(2030, 1, 1 + round)).toISOString().slice(0, 10) // 2030-02-01, -02, ...
    const body = JSON.stringify({
      ...booking('eq-3', '14:00', '15:00'),
      startAt: `${day}T14:00:00.000Z`,
      endAt: `${day}T15:00:00.000Z`,
      purpose: RACE.purpose,
    })
    const responses = await Promise.all(Array.from({ length: RACE.parallel }, () => send(body)))

    let wins = 0
    for (const res of responses) {
      tally[res.status] = (tally[res.status] ?? 0) + 1
      if (res.status === 201) {
        wins++
        created.add(JSON.parse(res.text).id)
        sampleWin ??= res
      } else if (res.status === 409) {
        sampleConflict ??= res
      }
    }
    sampleBody ??= body
    const others = responses.filter((res) => res.status !== 201 && res.status !== 409).length
    if (wins !== 1 || others > 0) {
      problems.push(`round ${round + 1} (${day}): ${wins} x 201 and ${others} unexpected response(s); expected exactly one 201 and the rest 409`)
    }
  }

  // The database must agree with the status codes: one stored booking per round.
  const stored = (await runCurl(curlArgs({ path: '/bookings' }))).json ?? []
  const storedForRace = stored.filter((b) => b.purpose === RACE.purpose).length
  if (storedForRace !== RACE.rounds) problems.push(`expected ${RACE.rounds} stored race bookings, found ${storedForRace}`)

  const total = RACE.rounds * RACE.parallel
  const actual = Object.entries(tally)
    .map(([status, count]) => `${count} x ${status === '0' ? 'no response' : status}`)
    .join(', ')
  return {
    summaryRequest: `${RACE.rounds} rounds x ${RACE.parallel} simultaneous POST /bookings`,
    expected: `${RACE.rounds} x 201 (one per round), ${total - RACE.rounds} x 409`,
    actual,
    lang: 'js',
    command:
      `// Node.js, one process. Each round sends ${RACE.parallel} of these at the same moment (Promise.all),\n` +
      `// and every round uses the next day (2030-02-01, 2030-02-02, ...). ${total} requests in total.\n` +
      `fetch('${url}', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: '${sampleBody}',\n})`,
    response: [
      `${total} responses: ${actual}`,
      `Bookings stored for the ${RACE.rounds} contested slots (GET /bookings afterwards): ${storedForRace}`,
      '',
      'Example of the one winner in a round:',
      `HTTP 201  ${sampleWin?.text ?? '(none)'}`,
      '',
      'Example of a loser in the same round:',
      `HTTP 409  ${sampleConflict?.text ?? '(none)'}`,
    ].join('\n'),
    problems: problems.slice(0, 5),
  }
}

async function runCase(testCase) {
  if (testCase.race) return runRace()

  let request
  try {
    request = testCase.request()
  } catch (error) {
    const expected = String(testCase.expect)
    return { summaryRequest: '(not run)', expected, actual: 'none', command: '# not run', response: '(not run)', problems: [error.message] }
  }
  const args = curlArgs(request)
  const res = await runCurl(args)
  const problems = []
  if (res.exitCode !== 0) problems.push(`curl failed: ${res.stderr || `exit code ${res.exitCode}`}`)
  if (res.status !== testCase.expect) problems.push(`expected HTTP ${testCase.expect}, got ${res.status || 'no response'}`)
  if (testCase.expect >= 400) {
    const shape = errorShapeProblem(res)
    if (shape) problems.push(shape)
  }
  if (testCase.check && problems.length === 0) {
    const outcome = testCase.check(res)
    if (outcome !== true) problems.push(String(outcome))
  }
  testCase.after?.(res)
  return {
    summaryRequest: `${request.method ?? 'GET'} ${decodeURIComponent(request.path)}`,
    expected: String(testCase.expect),
    actual: String(res.status || 'none'),
    command: showCommand(args),
    response: showResponse(res),
    problems,
  }
}

async function deleteBooking(id) {
  return (await runCurl(curlArgs({ method: 'DELETE', path: `/bookings/${id}` }))).status === 204
}

async function main() {
  // Connectivity check, and removal of anything a previously interrupted run left behind.
  const existing = await runCurl(curlArgs({ path: '/bookings' }))
  if (existing.exitCode !== 0 || !Array.isArray(existing.json)) {
    console.error(`Cannot reach the API at ${BASE_URL}\n${existing.stderr || existing.statusLine}`)
    console.error('Start it with "npm run dev" (after "npm run db:migrate"), or pass the Base API URL: npm test -- <url>')
    process.exit(2)
  }
  const leftovers = existing.json.filter((b) => typeof b.purpose === 'string' && b.purpose.startsWith(MARK))
  for (const leftover of leftovers) await deleteBooking(leftover.id)

  const startedAt = new Date()
  const results = []
  for (const [index, testCase] of cases.entries()) {
    const outcome = await runCase(testCase)
    const passed = outcome.problems.length === 0
    results.push({ number: index + 1, title: testCase.title, why: testCase.why, passed, ...outcome })
    const label = `${String(index + 1).padStart(2, '0')}  ${testCase.title}`
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${outcome.summaryRequest} -> ${outcome.actual}`)
    for (const problem of outcome.problems) console.log(`        ${problem}`)
  }

  let cleaned = 0
  for (const id of created) if (await deleteBooking(id)) cleaned++

  const passedCount = results.filter((result) => result.passed).length
  const failedCount = results.length - passedCount
  const curlVersion = (await runCurlVersion()) || 'curl'
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${BASE_URL}/`)

  const lines = [
    '# Test Evidence',
    '',
    `- **Base API URL:** \`${BASE_URL}\``,
    `- **Result:** ${passedCount} passed, ${failedCount} failed (${results.length} cases)`,
    `- **Run at:** ${startedAt.toISOString()} (local time: ${startedAt.toString()})`,
    `- **HTTP client:** ${curlVersion}`,
    `- **How it was run:** \`${isLocal ? 'npm test' : `npm test -- ${BASE_URL}`}\` (\`tests/run-tests.mjs\` starts one real \`curl\` process per request and records what it printed)`,
    `- **Server under test:** ${isLocal ? '`npm run dev` (wrangler dev with the local D1 / SQLite database)' : 'the deployed Cloudflare Worker with its remote D1 database'}`,
    '',
    `Each curl command below is shown exactly as it was run, except that \`${QUIET.join(' ')}\` was added to every`,
    'command (no progress meter, 20 second limit). The commands are written for a bash-style shell such as Git Bash.',
    'The one exception is the race-condition case, which needs many requests in flight at once and therefore uses',
    'Node.js `fetch` instead of curl; its section says so.',
    '',
    'For every case that expects an error, the runner also checked that the response is JSON of the form',
    '`{ "error": "<message>" }` with no other properties.',
    '',
    `Test data: every booking is dated 2030 and marked \`${MARK}\` in \`purpose\`. ` +
      `${leftovers.length} leftover booking(s) from an earlier run were removed before the run, ` +
      `and the ${cleaned} booking(s) still present at the end were deleted afterwards.`,
    '',
    '## Summary',
    '',
    '| # | Case | Request | Expected | Actual | Result |',
    '|--:|------|---------|----------|--------|--------|',
    ...results.map(
      (r) => `| ${r.number} | ${r.title} | \`${r.summaryRequest}\` | ${r.expected} | ${r.actual} | ${r.passed ? 'PASS' : '**FAIL**'} |`,
    ),
    '',
    '## Details',
  ]
  for (const r of results) {
    lines.push(
      '',
      `### ${r.number}. ${r.title}: ${r.passed ? 'PASS' : 'FAIL'}`,
      '',
      r.why,
      '',
      `Expected: ${r.expected}. Actual: ${r.actual}.`,
      ...r.problems.map((problem) => `\n**Problem:** ${problem}`),
      '',
      `\`\`\`${r.lang ?? 'bash'}`,
      r.command,
      '```',
      '',
      '```http',
      r.response,
      '```',
    )
  }
  writeFileSync(EVIDENCE_FILE, `${lines.join('\n')}\n`)

  console.log(`\n${passedCount} passed, ${failedCount} failed. Evidence written to TEST_EVIDENCE.md`)
  process.exitCode = failedCount === 0 ? 0 : 1
}

function runCurlVersion() {
  return new Promise((resolve) => {
    const child = spawn('curl', ['--version'])
    let out = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => (out += chunk))
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(out.split('\n')[0].trim()))
  })
}

await main()
