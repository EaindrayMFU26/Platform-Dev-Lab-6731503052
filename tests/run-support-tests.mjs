// Tests of the support-request router (assignment A6). Each request is a real curl command
// against the running API, and the complete responses are written to an evidence file.
//
//   npm run dev                      (terminal 1)
//   npm run test:support             (terminal 2: writes SUPPORT_ROUTER_EVIDENCE.md)
//
//   npm run dev:fallback             (terminal 1: a model id that does not exist, port 8789)
//   npm run test:support:fallback    (terminal 2: writes SUPPORT_ROUTER_FALLBACK_EVIDENCE.md)
//
//   npm run dev:timeout              (terminal 1: a 1 ms model timeout, port 8790)
//   npm run test:support:timeout     (terminal 2: writes SUPPORT_ROUTER_TIMEOUT_EVIDENCE.md)
//
// Usage: node tests/run-support-tests.mjs [baseUrl] [--mode model|fallback] [--reason <fallbackReason>]
//                                         [--out <file>] [--label <text>]
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { QUIET, curlArgs as buildCurlArgs, errorShapeProblem, runCurl, runCurlVersion, showCommand, showResponse } from './curl.mjs'
import { QUEUES, ROUTING_CASES, URGENCIES } from './support-cases.mjs'

const options = { mode: 'model', reason: undefined, out: undefined, label: undefined }
const positional = []
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (['--mode', '--reason', '--out', '--label'].includes(arg)) options[arg.slice(2)] = process.argv[++i]
  else positional.push(arg)
}
const BASE_URL = (positional[0] ?? process.env.BASE_URL ?? 'http://localhost:8787/api').replace(/\/+$/, '')
const MODE = options.mode
if (MODE !== 'model' && MODE !== 'fallback') {
  console.error('--mode must be "model" or "fallback"')
  process.exit(2)
}
const REASONS = ['model_unavailable', 'model_error', 'model_timeout', 'invalid_model_output']
const EXPECTED_REASON = options.reason
if (EXPECTED_REASON !== undefined && (MODE !== 'fallback' || !REASONS.includes(EXPECTED_REASON))) {
  console.error(`--reason needs --mode fallback and one of ${REASONS.join(', ')}`)
  process.exit(2)
}
// The evidence file and the scenario text follow from the mode and the expected fallback reason,
// so a run can never write one scenario's results under another scenario's name.
const SCENARIOS = {
  model: {
    out: 'SUPPORT_ROUTER_EVIDENCE.md',
    label: 'Normal operation: the decision model (`@cf/cloudflare/clef` on Workers AI) answers every request.',
  },
  model_error: {
    out: 'SUPPORT_ROUTER_FALLBACK_EVIDENCE.md',
    label:
      'Forced outage: the server was started with a model id that does not exist (`npm run dev:fallback`), so every decision must come from the deterministic fallback with reason model_error.',
  },
  model_timeout: {
    out: 'SUPPORT_ROUTER_TIMEOUT_EVIDENCE.md',
    label:
      'Forced timeout: the server was started with `npm run dev:timeout` (ROUTER_TIMEOUT_MS=1, a limit no real model call can meet), so every decision must come from the deterministic fallback with reason model_timeout.',
  },
}
if (MODE === 'fallback' && EXPECTED_REASON === undefined) {
  console.error(`--mode fallback needs --reason (${REASONS.join(', ')}): the run checks that every decision has it`)
  process.exit(2)
}
const scenario = SCENARIOS[MODE === 'model' ? 'model' : EXPECTED_REASON]
if (!scenario && (options.out === undefined || options.label === undefined)) {
  console.error(`--reason ${EXPECTED_REASON} has no standard evidence file: pass --out and --label as well`)
  process.exit(2)
}
const OUT = options.out ?? scenario.out
const LABEL = options.label ?? scenario.label
const EVIDENCE_FILE = fileURLToPath(new URL(`../${OUT}`, import.meta.url))
const RESPONSE_LIMIT = 4000 // decisions are long; show them whole

// How this run was started, for the evidence header: the npm script when there is one.
const quoteArg = (arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`)
const INVOCATION = process.env.npm_lifecycle_event
  ? `npm run ${process.env.npm_lifecycle_event}`
  : ['node tests/run-support-tests.mjs', ...process.argv.slice(2).map(quoteArg)].join(' ')

const curlArgs = (request) => buildCurlArgs(BASE_URL, request)

// Long runs of the letter x (the size tests) are shortened in the displayed commands.
const abbreviate = (text) => text.replace(/x{60,}/g, (run) => `xxxxxxxxxx...[${run.length} x characters in total]...xxxxxxxxxx`)

// ---------------------------------------------------------------------------------------
// What a valid decision looks like (the output schema)
// ---------------------------------------------------------------------------------------

function decisionProblem(d) {
  if (!d || typeof d !== 'object') return 'no decision object in the response'
  if (!QUEUES.includes(d.queue)) return `queue "${d.queue}" is not one of the allowed labels`
  if (!URGENCIES.includes(d.urgency)) return `urgency "${d.urgency}" is not one of the allowed labels`
  if (typeof d.needsHuman !== 'boolean') return 'needsHuman is not a boolean'
  if (!(typeof d.confidence === 'number' && d.confidence >= 0 && d.confidence <= 1)) return 'confidence is not a number from 0 to 1'
  if (d.source !== MODE) return `source is "${d.source}", expected "${MODE}"`
  if (MODE === 'model' && (d.fallbackReason !== null || typeof d.model !== 'string')) {
    return 'a model decision must name the model and have no fallbackReason'
  }
  if (MODE === 'fallback' && (!REASONS.includes(d.fallbackReason) || d.model !== null || d.needsHuman !== true)) {
    return 'a fallback decision must have a fallbackReason, no model, and needsHuman = true'
  }
  if (EXPECTED_REASON !== undefined && d.fallbackReason !== EXPECTED_REASON) {
    return `fallbackReason is "${d.fallbackReason}", but this scenario must produce "${EXPECTED_REASON}"`
  }
  const det = d.details
  if (!det || typeof det !== 'object') return 'details are missing'
  for (const q of QUEUES) if (typeof det.queueProbabilities?.[q] !== 'number') return `details.queueProbabilities.${q} is missing`
  for (const u of URGENCIES) if (typeof det.urgencyProbabilities?.[u] !== 'number') return `details.urgencyProbabilities.${u} is missing`
  if (typeof det.needsHumanProbability !== 'number' || !Array.isArray(det.reasons) || typeof det.latencyMs !== 'number') {
    return 'details are incomplete'
  }
  return null
}

const human = (flag) => (flag ? 'person' : 'auto')
const describe = (d) => `${d.queue} / ${d.urgency} / ${human(d.needsHuman)}`
// A decision without its timing, for comparing two decisions.
const withoutLatency = (d) => JSON.stringify({ ...d, details: { ...d.details, latencyMs: undefined } })

// Which of the three expected values a decision matches, for the routing table.
function matchSummary(d, expect) {
  const same = [d.queue === expect.queue && 'queue', d.urgency === expect.urgency && 'urgency', d.needsHuman === expect.needsHuman && 'who'].filter(Boolean)
  if (same.length === 3) return 'all three'
  if (same.length === 0) return '**none**'
  const differ = ['queue', 'urgency', 'who'].filter((field) => !same.includes(field))
  return `${same.join(', ')}; **${differ.join(', ')} differ${differ.length === 1 ? 's' : ''}**`
}

// ---------------------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------------------

const ids = {}
const created = new Set() // tickets that still exist and must be removed at the end
let ticketsCreated = 0
const routed = [] // the decision of each routing case, by case index (undefined when invalid)
const allDecisions = [] // every valid decision seen, for the header's fallback reason count
const need = (key) => {
  if (!ids[key]) throw new Error(`not run: an earlier case did not create ticket "${key}"`)
  return ids[key]
}
const errorHas = (text) => (res) => res.json?.error?.includes(text) || `error message should mention "${text}"`

const cases = ROUTING_CASES.map((rc, index) => ({
  title: rc.title,
  routing: rc,
  why: `Input: "${rc.message}". Expected: ${rc.expect.queue}, ${rc.expect.urgency} urgency, ${rc.expect.needsHuman ? 'a person must look first' : 'no person needed'}.`,
  request: () => ({ method: 'POST', path: '/support/route', json: { message: rc.message, ...(rc.context && { context: rc.context }) } }),
  expect: 200,
  check: (res) => {
    const problem = decisionProblem(res.json)
    if (problem) return problem
    if (MODE === 'model' && res.json.queue !== rc.expect.queue) return `the model chose ${res.json.queue}, expected ${rc.expect.queue}`
    return true
  },
  after: (res) => {
    if (decisionProblem(res.json) === null) routed[index] = res.json
  },
}))

const ticketInput = ROUTING_CASES[1]
cases.push(
  {
    title: 'Same input again gives the same decision',
    why:
      MODE === 'model'
        ? 'The first input is sent a second time. The whole decision (every probability, the reasons and the token count) must be identical; only the latency may differ.'
        : 'The first input is sent a second time. The keyword rules are deterministic by construction; this confirms that nothing else in the decision changes between two calls either. Only the latency may differ.',
    request: () => cases[0].request(),
    expect: 200,
    check: (res) => {
      const first = routed[0]
      if (!first) return 'routing case 1 produced no valid decision to compare with'
      return withoutLatency(res.json) === withoutLatency(first) || `second decision differs: ${describe(res.json)} vs ${describe(first)}`
    },
    after: (res) => decisionProblem(res.json) === null && allDecisions.push(res.json),
  },
  {
    title: 'File a ticket (the downstream action)',
    why: 'POST /support/tickets routes the message of case 2 and stores it together with the decision: 201 with the ticket. The stored decision must be the one /support/route gave for the same message in case 2.',
    request: () => ({ method: 'POST', path: '/support/tickets', json: { message: ticketInput.message, context: ticketInput.context } }),
    expect: 201,
    check: (res) => {
      const ok =
        typeof res.json?.id === 'string' &&
        res.json.message === ticketInput.message &&
        res.json.equipmentId === 'eq-2' &&
        decisionProblem(res.json.decision) === null
      if (!ok) return 'the ticket should have an id, echo the message and equipmentId, and carry a valid decision'
      return (routed[1] && withoutLatency(res.json.decision) === withoutLatency(routed[1])) || 'the stored decision differs from the decision of case 2'
    },
    after: (res) => {
      ids.ticket = res.json?.id
      ids.ticketQueue = res.json?.decision?.queue
      if (decisionProblem(res.json?.decision) === null) allDecisions.push(res.json.decision)
      if (res.json?.id) {
        created.add(res.json.id)
        ticketsCreated++
      }
    },
  },
  {
    title: 'List the tickets of a queue',
    why: 'Staff read one queue at a time. The new ticket appears under the queue it was routed to.',
    request: () => ({ path: `/support/tickets?queue=${encodeURIComponent(ids.ticketQueue ?? 'general_question')}` }),
    expect: 200,
    check: (res) => (Array.isArray(res.json) && res.json.some((t) => t.id === ids.ticket)) || 'the new ticket should be listed in its queue',
  },
  {
    title: 'Get one ticket',
    why: 'A ticket can be fetched by id, decision included.',
    request: () => ({ path: `/support/tickets/${need('ticket')}` }),
    expect: 200,
    check: (res) => (res.json?.id === ids.ticket && res.json.decision?.queue === ids.ticketQueue) || 'wrong ticket or missing decision',
  },
  {
    title: 'Unknown queue filter',
    why: 'The queue filter only accepts the four queue names.',
    request: () => ({ path: '/support/tickets?queue=complaints' }),
    expect: 400,
    check: errorHas('queue must be one of'),
  },
  {
    title: 'Unknown ticket',
    why: 'Reading a ticket that does not exist is 404.',
    request: () => ({ path: '/support/tickets/does-not-exist' }),
    expect: 404,
  },
  {
    title: 'Ticket about unknown equipment',
    why: 'context.equipmentId must refer to existing equipment, like equipmentId on a booking: 404. Nothing is sent to the model.',
    request: () => ({ method: 'POST', path: '/support/tickets', json: { message: 'The projector is broken', context: { equipmentId: 'eq-999' } } }),
    expect: 404,
    check: errorHas('eq-999'),
  },
  {
    title: 'Missing message',
    why: 'message is required.',
    request: () => ({ method: 'POST', path: '/support/route', json: {} }),
    expect: 400,
    check: errorHas('message is required'),
  },
  {
    title: 'Blank message',
    why: 'Whitespace only is not a message.',
    request: () => ({ method: 'POST', path: '/support/route', json: { message: '   ' } }),
    expect: 400,
    check: errorHas('message must be a non-empty string'),
  },
  {
    title: 'Message too long',
    why: 'Messages are limited to 2000 characters, which also bounds what is sent to the model.',
    request: () => ({ method: 'POST', path: '/support/route', json: { message: 'x'.repeat(2001) } }),
    expect: 400,
    check: errorHas('at most 2000 characters'),
  },
  {
    title: 'Request body too large',
    why: 'A body over 16 KB is refused before it is read or parsed: 413, still in the { "error" } shape.',
    request: () => ({ method: 'POST', path: '/support/route', json: { message: 'x'.repeat(20000) } }),
    expect: 413,
    check: errorHas('at most 16384 bytes'),
  },
  {
    title: 'NUL character in the message',
    why: 'As for bookings: a NUL character would make the database see a different text.',
    request: () => ({ method: 'POST', path: '/support/route', json: { message: 'help\u0000me' } }),
    expect: 400,
    check: errorHas('NUL'),
  },
  {
    title: 'Control character in the message',
    why: 'Control characters such as ESC (terminal escape sequences) are refused; tabs and line breaks are allowed.',
    request: () => ({ method: 'POST', path: '/support/route', json: { message: 'help\u001b[2Jme' } }),
    expect: 400,
    check: errorHas('control characters'),
  },
  {
    title: 'Context that is not an object',
    why: 'context, when present, must be an object with optional equipmentId and bookingId.',
    request: () => ({ method: 'POST', path: '/support/route', json: { message: 'hello', context: 'eq-1' } }),
    expect: 400,
    check: errorHas('context must be an object'),
  },
  {
    title: 'Malformed JSON body',
    why: 'A body that cannot be parsed is a client error, not a server crash.',
    request: () => ({ method: 'POST', path: '/support/route', rawBody: '{"message": ' }),
    expect: 400,
  },
  {
    title: 'Delete the ticket',
    why: 'DELETE returns 204 with an empty body.',
    request: () => ({ method: 'DELETE', path: `/support/tickets/${need('ticket')}` }),
    expect: 204,
    check: (res) => res.body === '' || '204 must not have a body',
    after: () => created.delete(ids.ticket),
  },
  {
    title: 'Deleted ticket is gone',
    why: 'The ticket really was removed.',
    request: () => ({ path: `/support/tickets/${need('ticket')}` }),
    expect: 404,
  },
)

// ---------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------

async function runCase(testCase) {
  let request
  try {
    request = testCase.request()
  } catch (error) {
    return { summaryRequest: '(not run)', expected: String(testCase.expect), actual: 'none', command: '# not run', response: '(not run)', problems: [error.message] }
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
  const decision = testCase.routing && decisionProblem(res.json) === null ? res.json : undefined
  if (decision) allDecisions.push(decision)
  return {
    summaryRequest: `${request.method ?? 'GET'} ${decodeURIComponent(request.path)}`,
    expected: String(testCase.expect),
    actual: String(res.status || 'none'),
    command: abbreviate(showCommand(args)),
    response: abbreviate(showResponse(res, RESPONSE_LIMIT)),
    decision,
    problems,
  }
}

const deleteTicket = async (id) => (await runCurl(curlArgs({ method: 'DELETE', path: `/support/tickets/${id}` }))).status === 204

const ms = (n) => `${Math.round(n)} ms`

async function main() {
  const before = await runCurl(curlArgs({ path: '/support/tickets' }))
  if (before.exitCode !== 0 || !Array.isArray(before.json)) {
    console.error(`Cannot reach the API at ${BASE_URL}\n${before.stderr || before.statusLine}`)
    console.error('Start it with "npm run dev" (after "npm run db:migrate"), or pass the Base API URL as the first argument')
    process.exit(2)
  }
  const ticketsBefore = before.json.length

  const startedAt = new Date()
  const results = []
  for (const [index, testCase] of cases.entries()) {
    const outcome = await runCase(testCase)
    const passed = outcome.problems.length === 0
    results.push({ number: index + 1, title: testCase.title, why: testCase.why, routing: testCase.routing, passed, ...outcome })
    const label = `${String(index + 1).padStart(2, '0')}  ${testCase.title}`
    const seen = outcome.decision ? ` -> ${describe(outcome.decision)} (${outcome.decision.source})` : ''
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${outcome.summaryRequest} -> ${outcome.actual}${seen}`)
    for (const problem of outcome.problems) console.log(`        ${problem}`)
  }

  let cleaned = 0
  for (const id of created) if (await deleteTicket(id)) cleaned++
  const leftBehind = created.size - cleaned

  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.length - passedCount
  const curlVersion = (await runCurlVersion()) || 'curl'
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${BASE_URL}/`)

  // Agreement between the expected decisions and the observed ones.
  const routedResults = results.filter((r) => r.routing && r.decision)
  const total = results.filter((r) => r.routing).length
  const agree = (pick) => routedResults.filter((r) => pick(r.decision) === pick(r.routing.expect)).length
  const latencies = routedResults.map((r) => r.decision.details.latencyMs)
  const tokens = routedResults.map((r) => r.decision.details.inputTokens).filter((t) => typeof t === 'number')
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const first = routedResults[0]?.decision
  const reasonCounts = {}
  for (const d of allDecisions) if (d.fallbackReason) reasonCounts[d.fallbackReason] = (reasonCounts[d.fallbackReason] ?? 0) + 1
  const modelLine =
    MODE === 'model'
      ? `- **Model:** \`${first?.model ?? '(none)'}\` (reported by the service as \`${first?.details.reportedModel ?? '?'}\`); ` +
        `latency per decision ${ms(Math.min(...latencies))} to ${ms(Math.max(...latencies))}, average ${ms(avg(latencies))}, measured inside the Worker; ` +
        `average ${Math.round(avg(tokens))} input tokens per decision`
      : `- **Fallback reasons seen:** ${Object.entries(reasonCounts).map(([reason, n]) => `\`${reason}\` in ${n} decision(s)`).join(', ') || '(none)'}` +
        `${EXPECTED_REASON ? `; every decision was required to have \`${EXPECTED_REASON}\`` : ''}. First reason text: ${first?.details.reasons[0] ?? '(none)'}`

  const lines = [
    '# Support Router Evidence',
    '',
    `- **Scenario:** ${LABEL}`,
    `- **Base API URL:** \`${BASE_URL}\``,
    `- **Result:** ${passedCount} passed, ${failedCount} failed (${results.length} cases)`,
    `- **Routing decisions compared with the expected ones (tests/support-cases.mjs):** queue ${agree((d) => d.queue)} of ${total}, urgency ${agree((d) => d.urgency)} of ${total}, needs-a-person ${agree((d) => d.needsHuman)} of ${total}`,
    modelLine,
    `- **Run at:** ${startedAt.toISOString()} (local time: ${startedAt.toString()})`,
    `- **HTTP client:** ${curlVersion}`,
    `- **How it was run:** \`${INVOCATION}\` (\`tests/run-support-tests.mjs\`, one real \`curl\` process per request; the runner records what it printed)`,
    `- **Server under test:** ${
      isLocal
        ? MODE === 'model'
          ? '`wrangler dev` with the local D1 database; the decision model itself runs on Cloudflare Workers AI'
          : '`wrangler dev` with the local D1 database; the call to the decision model was made to fail as described under Scenario'
        : 'the deployed Cloudflare Worker'
    }`,
    '',
    `Each curl command below is shown exactly as it was run, except that \`${QUIET.join(' ')}\` was added to every`,
    'command (no progress meter, 20 second limit) and that long runs of the letter x (the size tests) are shortened, with',
    'the real length in brackets. Commands are written for a bash-style shell such as Git Bash. A body with non-ASCII text',
    '(Thai) or over 8000 characters is piped to curl instead of being passed with -d, and is shown that way.',
    '',
    `In ${MODE} mode a routing case passes when the response is a complete, valid decision with \`source: "${MODE}"\`` +
      (MODE === 'model'
        ? ' **and** the chosen queue is the expected one. Urgency and needs-a-person are compared and shown in the table, but do not decide pass or fail.'
        : `, \`needsHuman: true\` and ${EXPECTED_REASON ? `\`fallbackReason: "${EXPECTED_REASON}"\`` : 'a `fallbackReason`'}. The queue the keyword rules chose is compared with the expectation for information only.`),
    'For every case that expects an error, the runner also checked that the response is JSON of the form `{ "error": "<message>" }` with no other properties.',
    '',
    `Test data: this run created ${ticketsCreated} ticket(s); ${ticketsCreated - created.size} were deleted by the delete case and ${cleaned} in the clean-up at the end. ` +
      `${leftBehind === 0 ? 'Nothing was left behind.' : `${leftBehind} ticket(s) could not be deleted.`} ` +
      `${ticketsBefore === 0 ? 'The ticket table was empty before the run.' : `${ticketsBefore} ticket(s) existed before the run and were left untouched.`}`,
    '',
    '## Routing decisions',
    '',
    '| # | Input | Expected (queue / urgency / who) | Actual (queue / urgency / who) | Matches | Confidence | Latency | Result |',
    '|--:|-------|----------------------------------|--------------------------------|---------|-----------:|--------:|--------|',
    ...results
      .filter((r) => r.routing)
      .map((r) => {
        const e = r.routing.expect
        const expected = `${e.queue} / ${e.urgency} / ${human(e.needsHuman)}`
        const d = r.decision
        const actual = d ? describe(d) : `(no valid decision: HTTP ${r.actual})`
        const matches = d ? matchSummary(d, e) : ''
        return `| ${r.number} | ${r.routing.message.replace(/\|/g, '\\|')} | ${expected} | ${actual} | ${matches} | ${d ? d.confidence : ''} | ${d ? ms(d.details.latencyMs) : ''} | ${r.passed ? 'PASS' : '**FAIL**'} |`
      }),
    '',
    '## Other cases',
    '',
    '| # | Case | Request | Expected | Actual | Result |',
    '|--:|------|---------|----------|--------|--------|',
    ...results
      .filter((r) => !r.routing)
      .map((r) => `| ${r.number} | ${r.title} | \`${r.summaryRequest}\` | ${r.expected} | ${r.actual} | ${r.passed ? 'PASS' : '**FAIL**'} |`),
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
      '```bash',
      r.command,
      '```',
      '',
      '```http',
      r.response,
      '```',
    )
  }
  writeFileSync(EVIDENCE_FILE, `${lines.join('\n')}\n`)

  console.log(`\n${passedCount} passed, ${failedCount} failed. Queue agreement ${agree((d) => d.queue)} of ${total}. Evidence written to ${OUT}`)
  process.exitCode = failedCount === 0 ? 0 : 1
}

await main()
