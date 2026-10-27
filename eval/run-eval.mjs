// Evaluation runner of assignment A7. Sends the 10 cases of eval/eval-cases.json to the running
// API several times each, as real curl commands, and records every decision, the response time
// measured by curl, and the token usage reported by the model. Writes eval/results/<variant>.json
// and the execution log eval/<VARIANT>_EVIDENCE.md.
//
//   Baseline, the A6 capability (ROUTER_GROUNDING off, the default):
//     npm run dev                 terminal 1, port 8787
//     npm run dev:fallback        terminal 2, port 8789 (a model id that does not exist)
//     npm run dev:timeout         terminal 3, port 8790 (a 1 ms model time limit)
//     npm run eval -- --variant baseline
//
//   Improved (ROUTER_GROUNDING on): start the same three servers with  -- --var ROUTER_GROUNDING:on
//     npm run eval -- --variant improved
//
//   Then: npm run eval:compare
//
// Options: --variant baseline|improved (required), --reps <n> (default 5),
//          --model-url, --error-url, --timeout-url (defaults http://localhost:8787/api, :8789, :8790)
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { QUIET, curlArgs, runCurl, runCurlVersion, showCommand, showResponse } from '../tests/curl.mjs'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))

// ---------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------

const options = {}
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (!arg.startsWith('--')) continue
  options[arg.slice(2)] = process.argv[++i]
}
const VARIANT = options.variant
if (VARIANT !== 'baseline' && VARIANT !== 'improved') {
  console.error('Usage: node eval/run-eval.mjs --variant baseline|improved [--reps 5]')
  process.exit(2)
}
const REPS = Number(options.reps ?? 5)
if (!Number.isInteger(REPS) || REPS < 1 || REPS > 50) {
  console.error('--reps must be a whole number from 1 to 50')
  process.exit(2)
}
const trim = (url) => url.replace(/\/+$/, '')
const URLS = {
  model: trim(options['model-url'] ?? 'http://localhost:8787/api'),
  model_error: trim(options['error-url'] ?? 'http://localhost:8789/api'),
  model_timeout: trim(options['timeout-url'] ?? 'http://localhost:8790/api'),
}

// Cloudflare's published price for @cf/cloudflare/clef (checked on 26 October 2026): input tokens
// only, output tokens are free. The cost per task is an estimate: measured tokens times this price.
const USD_PER_MILLION_INPUT_TOKENS = 0.24
const NEURONS_PER_MILLION_INPUT_TOKENS = 21818

// ---------------------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------------------

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const DATASET_PATH = here('./eval-cases.json')
const KB_PATH = here('../src/knowledge-base.json')
const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf8'))
const CASES = dataset.cases
const typeCounts = {}
for (const c of CASES) typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1
const wanted = { normal: 3, edge: 3, fallback: 2, difficult: 2 }
if (CASES.length !== 10 || Object.entries(wanted).some(([type, n]) => typeCounts[type] !== n)) {
  console.error(`eval-cases.json must have 3 normal, 3 edge, 2 fallback and 2 difficult cases; found ${JSON.stringify(typeCounts)}`)
  process.exit(2)
}
for (const c of CASES) {
  if (!URLS[c.scenario]) {
    console.error(`${c.id}: unknown scenario "${c.scenario}"`)
    process.exit(2)
  }
}

// ---------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------

const routeRequest = (input) => ({
  method: 'POST',
  path: '/support/route',
  json: { message: input.message, ...(input.context && { context: input.context }) },
})

// One curl command; curl itself measures the time (time_total), so starting the process is not counted.
async function send(baseUrl, request) {
  const args = curlArgs(baseUrl, request)
  args.push('-w', '\n@@time_total=%{time_total}')
  const res = await runCurl(args)
  const marker = /\r?\n?@@time_total=([\d.]+)\s*$/.exec(res.body)
  const body = marker ? res.body.slice(0, marker.index) : res.body
  let json
  try {
    json = JSON.parse(body)
  } catch {
    json = undefined
  }
  const clientMs = marker ? Math.round(parseFloat(marker[1]) * 10000) / 10 : null
  return { args, res: { ...res, body, json }, clientMs }
}

function judge(c, d) {
  if (!d || typeof d !== 'object' || typeof d.queue !== 'string') return { correct: false, diffs: ['no decision in the response'] }
  const e = c.expected
  const diffs = []
  for (const field of ['queue', 'urgency', 'needsHuman', 'source']) {
    if (d[field] !== e[field]) diffs.push(`${field}: expected ${e[field]}, got ${d[field]}`)
  }
  if (e.fallbackReason !== undefined && d.fallbackReason !== e.fallbackReason) {
    diffs.push(`fallbackReason: expected ${e.fallbackReason}, got ${d.fallbackReason}`)
  }
  return { correct: diffs.length === 0, diffs }
}

// The variant must match the servers: every request here reaches the model call, so with grounding
// on each decision lists the knowledge records it sent, and with grounding off none.
function variantProblem(c, d) {
  const records = d?.details?.contextRecords
  if (!Array.isArray(records)) return `${c.id}: the response has no details.contextRecords; is the server running the A7 code?`
  if (VARIANT === 'baseline' && records.length > 0) return `${c.id}: context records were sent (${records.join(', ')}), so this server has ROUTER_GROUNDING on; the baseline needs it off`
  if (VARIANT === 'improved' && records.length === 0) return `${c.id}: no context records were sent, so this server has ROUTER_GROUNDING off; the improved run needs it on`
  return null
}

const withoutLatency = (d) => JSON.stringify({ ...d, details: { ...d?.details, latencyMs: undefined } })
const percentile = (values, p) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)
const median = (values) => percentile(values, 50)

// ---------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------

async function main() {
  // Every server must answer before anything is measured.
  for (const [scenario, url] of Object.entries(URLS)) {
    if (!CASES.some((c) => c.scenario === scenario)) continue
    const probe = await runCurl(curlArgs(url, { path: '' }))
    if (probe.exitCode !== 0 || probe.status !== 200) {
      console.error(`The ${scenario} server does not answer at ${url} (${probe.stderr || probe.statusLine}). See the header of eval/run-eval.mjs.`)
      process.exit(2)
    }
  }

  // One warm-up request per server, not measured: the first request after a start is slower.
  const warmups = []
  for (const [scenario, url] of Object.entries(URLS)) {
    if (!CASES.some((c) => c.scenario === scenario)) continue
    const w = await send(url, routeRequest({ message: 'Warm-up request before the measurements, please ignore.' }))
    warmups.push({ scenario, status: w.res.status, clientMs: w.clientMs })
  }

  const startedAt = new Date()
  const runs = [] // every request, in the order sent
  const details = {} // the command and response of the first repetition of each case
  for (let rep = 1; rep <= REPS; rep++) {
    for (const c of CASES) {
      const { args, res, clientMs } = await send(URLS[c.scenario], routeRequest(c.input))
      const d = res.json
      if (res.status !== 200) {
        console.error(`${c.id} (rep ${rep}): HTTP ${res.status || 'no response'} ${res.stderr ?? ''}`)
        process.exit(1)
      }
      const problem = variantProblem(c, d)
      if (problem) {
        console.error(problem)
        process.exit(1)
      }
      const verdict = judge(c, d)
      runs.push({
        id: c.id,
        rep,
        clientMs,
        workerMs: d.details.latencyMs,
        inputTokens: d.details.inputTokens,
        contextRecords: d.details.contextRecords,
        correct: verdict.correct,
        diffs: verdict.diffs,
        decision: d,
      })
      if (rep === 1) details[c.id] = { command: showCommand(args), response: showResponse(res, 6000) }
      const label = `${c.id} rep ${rep}`
      console.log(`${verdict.correct ? 'PASS' : 'FAIL'}  ${label.padEnd(11)} ${d.queue} / ${d.urgency} / ${d.needsHuman ? 'person' : 'auto'} (${d.source})  ${clientMs} ms`)
    }
  }

  // Per case: correct only if every repetition was correct.
  const caseResults = CASES.map((c) => {
    const own = runs.filter((r) => r.id === c.id)
    const first = own[0].decision
    return {
      id: c.id,
      type: c.type,
      scenario: c.scenario,
      input: c.input,
      expected: c.expected,
      correct: own.every((r) => r.correct),
      consistent: own.every((r) => withoutLatency(r.decision) === withoutLatency(first)),
      diffs: own[0].diffs,
      actual: { queue: first.queue, urgency: first.urgency, needsHuman: first.needsHuman, source: first.source, fallbackReason: first.fallbackReason, confidence: first.confidence },
      contextRecords: first.details.contextRecords,
      inputTokens: first.details.inputTokens,
      clientMs: own.map((r) => r.clientMs),
      workerMs: own.map((r) => r.workerMs),
    }
  })

  const modelCases = caseResults.filter((c) => c.scenario === 'model')
  const tokens = modelCases.map((c) => c.inputTokens).filter((t) => typeof t === 'number')
  const allClient = runs.map((r) => r.clientMs)
  const modelClient = runs.filter((r) => CASES.find((c) => c.id === r.id).scenario === 'model').map((r) => r.clientMs)
  const modelWorker = runs.filter((r) => CASES.find((c) => c.id === r.id).scenario === 'model').map((r) => r.workerMs)
  const correctCases = caseResults.filter((c) => c.correct).length
  const fieldAgreement = (field) => caseResults.filter((c) => c.actual[field] === c.expected[field]).length
  const metrics = {
    cases: caseResults.length,
    correctCases,
    accuracyPercent: (correctCases / caseResults.length) * 100,
    queueAgreement: fieldAgreement('queue'),
    urgencyAgreement: fieldAgreement('urgency'),
    needsHumanAgreement: fieldAgreement('needsHuman'),
    allRepetitionsConsistent: caseResults.every((c) => c.consistent),
    requests: runs.length,
    clientMs: { p50: median(allClient), p95: percentile(allClient, 95), max: Math.max(...allClient), mean: mean(allClient) },
    modelClientMs: { requests: modelClient.length, p50: median(modelClient), p95: percentile(modelClient, 95), max: Math.max(...modelClient) },
    modelWorkerMs: { p50: median(modelWorker), p95: percentile(modelWorker, 95) },
    inputTokensPerModelTask: { mean: mean(tokens), min: Math.min(...tokens), max: Math.max(...tokens) },
    estimatedUsdPerModelTask: (mean(tokens) * USD_PER_MILLION_INPUT_TOKENS) / 1e6,
    estimatedNeuronsPerModelTask: (mean(tokens) * NEURONS_PER_MILLION_INPUT_TOKENS) / 1e6,
  }

  const result = {
    variant: VARIANT,
    grounding: VARIANT === 'improved' ? 'on' : 'off',
    runAt: startedAt.toISOString(),
    repetitions: REPS,
    servers: URLS,
    dataset: { path: 'eval/eval-cases.json', sha256: sha256(DATASET_PATH) },
    knowledgeBase: { path: 'src/knowledge-base.json', sha256: sha256(KB_PATH) },
    pricing: { usdPerMillionInputTokens: USD_PER_MILLION_INPUT_TOKENS, neuronsPerMillionInputTokens: NEURONS_PER_MILLION_INPUT_TOKENS, source: 'https://developers.cloudflare.com/workers-ai/models/clef/' },
    warmups,
    metrics,
    cases: caseResults,
    runs,
  }
  mkdirSync(here('./results'), { recursive: true })
  writeFileSync(here(`./results/${VARIANT}.json`), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(here(`./${VARIANT.toUpperCase()}_EVIDENCE.md`), evidence(result, details, (await runCurlVersion()) || 'curl'))

  console.log(
    `\n${VARIANT}: accuracy ${correctCases}/10 = ${metrics.accuracyPercent}%, p95 ${metrics.clientMs.p95} ms over ${runs.length} requests, ` +
      `${Math.round(metrics.inputTokensPerModelTask.mean)} input tokens per model task. Written eval/results/${VARIANT}.json and eval/${VARIANT.toUpperCase()}_EVIDENCE.md`,
  )
}

// ---------------------------------------------------------------------------------------
// Evidence file
// ---------------------------------------------------------------------------------------

const who = (flag) => (flag ? 'person' : 'auto')
const triple = (d) => `${d.queue} / ${d.urgency} / ${who(d.needsHuman)}${d.source === 'fallback' ? ` (fallback: ${d.fallbackReason})` : ''}`
const esc = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const fmt = (n, digits = 1) => (n === null || n === undefined ? 'n/a' : Number(n).toFixed(digits))

function evidence(r, details, curlVersion) {
  const m = r.metrics
  const lines = [
    `# A7 Evaluation Evidence: ${r.variant}`,
    '',
    `- **Variant:** ${r.variant === 'baseline' ? 'baseline, the A6 capability unchanged (`ROUTER_GROUNDING` off)' : 'improved: retrieved guidelines from the knowledge base are sent to the model (`ROUTER_GROUNDING` on)'}`,
    `- **Result:** accuracy ${m.correctCases} of ${m.cases} cases = ${m.accuracyPercent}% (queue ${m.queueAgreement}/10, urgency ${m.urgencyAgreement}/10, needs-a-person ${m.needsHumanAgreement}/10); every repetition gave the same decision: ${m.allRepetitionsConsistent ? 'yes' : '**no**'}`,
    `- **Response time (curl, all ${m.requests} requests):** p50 ${fmt(m.clientMs.p50)} ms, p95 ${fmt(m.clientMs.p95)} ms, max ${fmt(m.clientMs.max)} ms`,
    `- **Response time of the ${m.modelClientMs.requests} requests the model answered:** p50 ${fmt(m.modelClientMs.p50)} ms, p95 ${fmt(m.modelClientMs.p95)} ms; time inside the Worker for the decision: p50 ${fmt(m.modelWorkerMs.p50, 0)} ms, p95 ${fmt(m.modelWorkerMs.p95, 0)} ms`,
    `- **Input tokens per task the model answered (measured, reported by the model):** mean ${fmt(m.inputTokensPerModelTask.mean)}, min ${m.inputTokensPerModelTask.min}, max ${m.inputTokensPerModelTask.max}`,
    `- **Estimated cost per task the model answered:** $${m.estimatedUsdPerModelTask.toFixed(7)} (${fmt(m.estimatedNeuronsPerModelTask, 2)} neurons) = measured tokens × $${r.pricing.usdPerMillionInputTokens} per million input tokens, Cloudflare's published price; output tokens are free`,
    `- **Run at:** ${r.runAt}; ${r.repetitions} repetitions of every case, sent one at a time in rounds (T01 to T10, then again), after one unmeasured warm-up request per server`,
    `- **Servers:** model \`${r.servers.model}\`, model_error \`${r.servers.model_error}\`, model_timeout \`${r.servers.model_timeout}\``,
    `- **Dataset:** \`${r.dataset.path}\` (SHA-256 ${r.dataset.sha256}); knowledge base \`${r.knowledgeBase.path}\` (SHA-256 ${r.knowledgeBase.sha256})`,
    `- **How it was run:** \`npm run eval -- --variant ${r.variant}${r.repetitions === 5 ? '' : ` --reps ${r.repetitions}`}\` (\`eval/run-eval.mjs\`); HTTP client: ${curlVersion}`,
    '',
    'A case is correct when queue, urgency and needsHuman all equal the expected values; for a fallback case the decision must also come from the',
    'fallback with the expected fallbackReason. A case counts as correct only if every repetition is correct. The response time is curl\'s',
    '`time_total` for the request, so starting the curl process is not included. The cost is an estimate (measured tokens × list price); on the',
    'free plan these requests are not billed within the daily allowance.',
    '',
    '## Results per case',
    '',
    '| ID | Type | Expected (queue / urgency / who) | Actual (queue / urgency / who) | Pass/Fail | Median ms | Tokens | Context records |',
    '|----|------|----------------------------------|--------------------------------|-----------|----------:|-------:|-----------------|',
    ...r.cases.map(
      (c) =>
        `| ${c.id} | ${c.type} | ${triple(c.expected)} | ${triple(c.actual)} | ${c.correct ? 'PASS' : '**FAIL**'}${c.correct ? '' : ` (${esc(c.diffs.join('; '))})`} | ${fmt(median(c.clientMs))} | ${c.inputTokens ?? 'n/a'} | ${c.contextRecords.join(', ') || '(none)'} |`,
    ),
    '',
    '## Every measured request',
    '',
    `Response time in ms, as measured by curl. Warm-up requests (not counted): ${r.warmups.map((w) => `${w.scenario} ${fmt(w.clientMs)} ms`).join(', ')}.`,
    '',
    `| Repetition | ${r.cases.map((c) => c.id).join(' | ')} |`,
    `|-----------:|${r.cases.map(() => '-----:').join('|')}|`,
    ...Array.from({ length: r.repetitions }, (_, i) => `| ${i + 1} | ${r.cases.map((c) => fmt(c.clientMs[i])).join(' | ')} |`),
    '',
    '## Details (first repetition of each case)',
    '',
    `Each curl command is shown as it was run, except that \`${QUIET.join(' ')}\` was added to every command.`,
  ]
  for (const c of r.cases) {
    lines.push(
      '',
      `### ${c.id} (${c.type}, scenario ${c.scenario}): ${c.correct ? 'PASS' : 'FAIL'}`,
      '',
      `Expected: ${triple(c.expected)}. Actual: ${triple(c.actual)}.${c.correct ? '' : ` Differences: ${c.diffs.join('; ')}.`}`,
      '',
      '```bash',
      details[c.id].command,
      '```',
      '',
      '```http',
      details[c.id].response,
      '```',
    )
  }
  return `${lines.join('\n')}\n`
}

await main()
