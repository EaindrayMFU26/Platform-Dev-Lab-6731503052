// Interleaved latency check (assignment A7). The baseline and the improved evaluation runs were
// made one after the other, so if the service was faster or slower during one of them, that would
// look like a difference between the variants. Here every case the model answers is sent to both
// variants in the same round, alternating which one goes first, so both see the same conditions.
// It checks the latency only; accuracy comes from the two evaluation runs (npm run eval).
//
//   npm run dev                                              terminal 1: baseline, port 8787
//   npm run dev -- --name equipment-booking-api-grounded --port 8791 --var ROUTER_GROUNDING:on
//                                                            terminal 2: improved, port 8791
//   npm run eval:latency                                     (option: -- --rounds <n>, default 5)
//
// The second server needs its own Worker name: two local sessions of the same Worker name share
// wrangler's local registry entry, and one of them then answered the other's port (seen on
// 26 October 2026; the check below stops when a server answers with the wrong setting).
//
// Writes eval/results/latency-check.json and eval/LATENCY_CHECK.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { curlArgs, runCurl, runCurlVersion } from '../tests/curl.mjs'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const options = {}
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) options[process.argv[i].slice(2)] = process.argv[++i]
const ROUNDS = Number(options.rounds ?? 5)
const URLS = { baseline: options['baseline-url'] ?? 'http://localhost:8787/api', improved: options['improved-url'] ?? 'http://localhost:8791/api' }

const CASES = JSON.parse(readFileSync(here('./eval-cases.json'), 'utf8')).cases.filter((c) => c.scenario === 'model')
const MAIN = { baseline: JSON.parse(readFileSync(here('./results/baseline.json'), 'utf8')), improved: JSON.parse(readFileSync(here('./results/improved.json'), 'utf8')) }

// The same timed request as in run-eval.mjs: curl measures time_total itself.
async function send(baseUrl, input) {
  const args = curlArgs(baseUrl, { method: 'POST', path: '/support/route', json: { message: input.message, ...(input.context && { context: input.context }) } })
  args.push('-w', '\n@@time_total=%{time_total}')
  const res = await runCurl(args)
  const marker = /\r?\n?@@time_total=([\d.]+)\s*$/.exec(res.body)
  let json
  try {
    json = JSON.parse(marker ? res.body.slice(0, marker.index) : res.body)
  } catch {
    json = undefined
  }
  return { status: res.status, clientMs: marker ? Math.round(parseFloat(marker[1]) * 10000) / 10 : null, decision: json }
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}
const fmt = (n) => (n === null || n === undefined ? 'n/a' : Number(n).toFixed(1))

async function main() {
  for (const [variant, url] of Object.entries(URLS)) {
    const probe = await runCurl(curlArgs(url, { path: '' }))
    if (probe.status !== 200) {
      console.error(`The ${variant} server does not answer at ${url}. See the header of eval/latency-check.mjs.`)
      process.exit(2)
    }
    await send(url, { message: 'Warm-up request before the measurements, please ignore.' })
  }

  const startedAt = new Date()
  const pairs = []
  for (let round = 1; round <= ROUNDS; round++) {
    for (const c of CASES) {
      const order = round % 2 === 1 ? ['baseline', 'improved'] : ['improved', 'baseline']
      const got = {}
      for (const variant of order) {
        const r = await send(URLS[variant], c.input)
        const d = r.decision
        if (r.status !== 200 || !d?.details) {
          console.error(`${c.id} ${variant}: HTTP ${r.status}`)
          process.exit(1)
        }
        // The servers must be the right variants, and the decisions must be those of the main runs.
        const records = d.details.contextRecords ?? []
        if ((variant === 'baseline') !== (records.length === 0)) {
          console.error(`${c.id}: the ${variant} server at ${URLS[variant]} runs the wrong ROUTER_GROUNDING setting`)
          process.exit(1)
        }
        const main = MAIN[variant].cases.find((x) => x.id === c.id).actual
        got[variant] = {
          clientMs: r.clientMs,
          workerMs: d.details.latencyMs,
          inputTokens: d.details.inputTokens,
          sameAsMainRun: d.queue === main.queue && d.urgency === main.urgency && d.needsHuman === main.needsHuman,
        }
      }
      pairs.push({ round, id: c.id, first: order[0], ...got })
      console.log(`round ${round} ${c.id}: baseline ${got.baseline.clientMs} ms, improved ${got.improved.clientMs} ms (${order[0]} first)`)
    }
  }

  const stats = (variant, key) => {
    const values = pairs.map((p) => p[variant][key])
    return { p50: percentile(values, 50), p95: percentile(values, 95), max: Math.max(...values) }
  }
  const differences = pairs.map((p) => p.improved.clientMs - p.baseline.clientMs)
  const result = {
    runAt: startedAt.toISOString(),
    rounds: ROUNDS,
    servers: URLS,
    pairs,
    baseline: { clientMs: stats('baseline', 'clientMs'), workerMs: stats('baseline', 'workerMs') },
    improved: { clientMs: stats('improved', 'clientMs'), workerMs: stats('improved', 'workerMs') },
    pairedDifferenceMs: { p50: percentile(differences, 50), improvedSlowerIn: differences.filter((d) => d > 0).length, of: differences.length },
    decisionsSameAsMainRuns: pairs.every((p) => p.baseline.sameAsMainRun && p.improved.sameAsMainRun),
  }
  mkdirSync(here('./results'), { recursive: true })
  writeFileSync(here('./results/latency-check.json'), `${JSON.stringify(result, null, 2)}\n`)

  const lines = [
    '# A7 Interleaved Latency Check',
    '',
    `- **Run at:** ${result.runAt}; ${ROUNDS} rounds; in each round every case the model answers (${CASES.map((c) => c.id).join(', ')}) was sent to both variants, one right after the other, alternating which went first.`,
    `- **Servers:** baseline \`${URLS.baseline}\` (ROUTER_GROUNDING off), improved \`${URLS.improved}\` (ROUTER_GROUNDING on); one unmeasured warm-up request each.`,
    `- **How it was run:** \`npm run eval:latency\` (\`eval/latency-check.mjs\`); HTTP client: ${(await runCurlVersion()) || 'curl'}`,
    `- **Decisions:** every decision was the same as in the evaluation run of its variant: ${result.decisionsSameAsMainRuns ? 'yes' : '**no**'}.`,
    '',
    '## Result',
    '',
    '| Measure (ms) | Baseline | Improved |',
    '|---|---:|---:|',
    `| Response time p50 (curl) | ${fmt(result.baseline.clientMs.p50)} | ${fmt(result.improved.clientMs.p50)} |`,
    `| Response time p95 (curl) | ${fmt(result.baseline.clientMs.p95)} | ${fmt(result.improved.clientMs.p95)} |`,
    `| Response time max (curl) | ${fmt(result.baseline.clientMs.max)} | ${fmt(result.improved.clientMs.max)} |`,
    `| Decision time in the Worker p50 | ${fmt(result.baseline.workerMs.p50)} | ${fmt(result.improved.workerMs.p50)} |`,
    `| Decision time in the Worker p95 | ${fmt(result.baseline.workerMs.p95)} | ${fmt(result.improved.workerMs.p95)} |`,
    '',
    `Per pair (same case, same round): the improved variant was slower in ${result.pairedDifferenceMs.improvedSlowerIn} of ${result.pairedDifferenceMs.of} pairs; the median difference was ${fmt(result.pairedDifferenceMs.p50)} ms.`,
    '',
    '## Every pair',
    '',
    '| Round | Case | First | Baseline ms | Improved ms | Difference ms | Baseline tokens | Improved tokens |',
    '|------:|------|-------|------------:|------------:|--------------:|----------------:|----------------:|',
    ...pairs.map(
      (p) =>
        `| ${p.round} | ${p.id} | ${p.first} | ${fmt(p.baseline.clientMs)} | ${fmt(p.improved.clientMs)} | ${fmt(p.improved.clientMs - p.baseline.clientMs)} | ${p.baseline.inputTokens} | ${p.improved.inputTokens} |`,
    ),
    '',
  ]
  writeFileSync(here('./LATENCY_CHECK.md'), lines.join('\n'))
  console.log(
    `\np95 baseline ${fmt(result.baseline.clientMs.p95)} ms, improved ${fmt(result.improved.clientMs.p95)} ms; improved slower in ${result.pairedDifferenceMs.improvedSlowerIn}/${result.pairedDifferenceMs.of} pairs, median difference ${fmt(result.pairedDifferenceMs.p50)} ms. Written eval/LATENCY_CHECK.md`,
  )
}

await main()
