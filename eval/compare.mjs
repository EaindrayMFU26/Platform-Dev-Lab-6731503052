// Compares the baseline and the improved evaluation run (assignment A7) and writes eval/COMPARISON.md.
//   npm run eval:compare      (after npm run eval -- --variant baseline and --variant improved)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const load = (variant) => {
  try {
    return JSON.parse(readFileSync(here(`./results/${variant}.json`), 'utf8'))
  } catch {
    console.error(`eval/results/${variant}.json is missing: run npm run eval -- --variant ${variant} first`)
    process.exit(2)
  }
}
const before = load('baseline')
const after = load('improved')

// Both runs must have used exactly the same cases and knowledge base.
for (const key of ['dataset', 'knowledgeBase']) {
  if (before[key].sha256 !== after[key].sha256) {
    console.error(`The two runs used different versions of ${before[key].path}; the comparison would not be fair.`)
    process.exit(1)
  }
}

const who = (flag) => (flag ? 'person' : 'auto')
const triple = (d) => `${d.queue} / ${d.urgency} / ${who(d.needsHuman)}${d.source === 'fallback' ? ' (fallback)' : ''}`
const fmt = (n, digits = 1) => (n === null || n === undefined ? 'n/a' : Number(n).toFixed(digits))
const signed = (n, digits = 1, unit = '') => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}${unit}`
const percentChange = (a, b) => (a ? `${signed(((b - a) / a) * 100, 0, '%')}` : 'n/a')

const mb = before.metrics
const ma = after.metrics
const rows = [
  ['Accuracy', `${mb.correctCases}/10 = ${mb.accuracyPercent}%`, `${ma.correctCases}/10 = ${ma.accuracyPercent}%`, `${signed(ma.accuracyPercent - mb.accuracyPercent, 0, ' points')}`],
  ['p95 latency, all requests (curl)', `${fmt(mb.clientMs.p95)} ms`, `${fmt(ma.clientMs.p95)} ms`, `${signed(ma.clientMs.p95 - mb.clientMs.p95, 1, ' ms')} (${percentChange(mb.clientMs.p95, ma.clientMs.p95)})`],
  ['p95 latency, requests the model answered (curl)', `${fmt(mb.modelClientMs.p95)} ms`, `${fmt(ma.modelClientMs.p95)} ms`, `${signed(ma.modelClientMs.p95 - mb.modelClientMs.p95, 1, ' ms')} (${percentChange(mb.modelClientMs.p95, ma.modelClientMs.p95)})`],
  ['p50 latency, all requests (curl)', `${fmt(mb.clientMs.p50)} ms`, `${fmt(ma.clientMs.p50)} ms`, `${signed(ma.clientMs.p50 - mb.clientMs.p50, 1, ' ms')}`],
  ['Input tokens per task the model answered (measured)', fmt(mb.inputTokensPerModelTask.mean), fmt(ma.inputTokensPerModelTask.mean), `${signed(ma.inputTokensPerModelTask.mean - mb.inputTokensPerModelTask.mean, 1)} (${percentChange(mb.inputTokensPerModelTask.mean, ma.inputTokensPerModelTask.mean)})`],
  ['Cost per task, estimated (tokens × list price)', `$${mb.estimatedUsdPerModelTask.toFixed(7)}`, `$${ma.estimatedUsdPerModelTask.toFixed(7)}`, `${percentChange(mb.estimatedUsdPerModelTask, ma.estimatedUsdPerModelTask)}`],
  ['Neurons per task, estimated', fmt(mb.estimatedNeuronsPerModelTask, 2), fmt(ma.estimatedNeuronsPerModelTask, 2), `${percentChange(mb.estimatedNeuronsPerModelTask, ma.estimatedNeuronsPerModelTask)}`],
  ['Queue / urgency / who agreement', `${mb.queueAgreement} / ${mb.urgencyAgreement} / ${mb.needsHumanAgreement}`, `${ma.queueAgreement} / ${ma.urgencyAgreement} / ${ma.needsHumanAgreement}`, ''],
]

const caseRows = before.cases.map((b) => {
  const a = after.cases.find((c) => c.id === b.id)
  const change = b.correct === a.correct ? (b.correct ? 'same (pass)' : 'same (fail)') : a.correct ? '**improved**' : '**worse**'
  return { id: b.id, type: b.type, expected: triple(b.expected), before: triple(b.actual), after: triple(a.actual), beforePass: b.correct, afterPass: a.correct, change, contextRecords: a.contextRecords, tokensBefore: b.inputTokens, tokensAfter: a.inputTokens }
})
const improvedIds = caseRows.filter((r) => r.change === '**improved**').map((r) => r.id)

// Median time inside the Worker of the requests the model answered, in each round of a run
// (nearest-rank, the same percentile as in run-eval.mjs).
const percentile = (values, p) => {
  const sorted = [...values].sort((x, y) => x - y)
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}
const roundMedians = (result) => {
  const modelCases = new Set(result.cases.filter((c) => c.scenario === 'model').map((c) => c.id))
  return Array.from({ length: result.repetitions }, (_, i) =>
    percentile(result.runs.filter((r) => r.rep === i + 1 && modelCases.has(r.id)).map((r) => r.workerMs), 50),
  )
}
const roundsBefore = roundMedians(before)
const roundsAfter = roundMedians(after)
const span = (values) => `${Math.min(...values)} to ${Math.max(...values)}`
const worseIds = caseRows.filter((r) => r.change === '**worse**').map((r) => r.id)

const lines = [
  '# A7 Evaluation: before and after',
  '',
  `- **Baseline:** ${before.runAt}, ROUTER_GROUNDING off (the A6 capability). **Improved:** ${after.runAt}, ROUTER_GROUNDING on.`,
  `- **Same dataset and knowledge base in both runs:** eval-cases.json SHA-256 ${before.dataset.sha256}, knowledge-base.json SHA-256 ${before.knowledgeBase.sha256}.`,
  `- **Repetitions:** ${before.repetitions} (baseline) and ${after.repetitions} (improved) of every case; ${before.metrics.requests} and ${after.metrics.requests} measured requests.`,
  `- **Cases that improved:** ${improvedIds.join(', ') || 'none'}. **Cases that became worse:** ${worseIds.join(', ') || 'none'}.`,
  '- Latency and tokens are measured; the cost is an estimate from the measured tokens and the published price.',
  '- Written by `npm run eval:compare` (`eval/compare.mjs`) from `eval/results/baseline.json` and `eval/results/improved.json`.',
  '',
  '## Metrics',
  '',
  '| Metric | Before | After | Change |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.join(' | ')} |`),
  '',
  '## Time inside the Worker, per round',
  '',
  'Median (p50, nearest-rank) of the decision time measured inside the Worker, over the requests the model answered in each round (the fallback cases are left out).',
  '',
  '| Round | Before (ms) | After (ms) |',
  '|---:|---:|---:|',
  ...roundsBefore.map((ms, i) => `| ${i + 1} | ${ms} | ${roundsAfter[i] ?? 'n/a'} |`),
  `| Range | ${span(roundsBefore)} | ${span(roundsAfter)} |`,
  '',
  '## Cases',
  '',
  '| ID | Type | Expected | Before | After | Before | After | Change | Records sent (after) | Tokens before → after |',
  '|----|------|----------|--------|-------|--------|-------|--------|----------------------|----------------------|',
  ...caseRows.map(
    (r) =>
      `| ${r.id} | ${r.type} | ${r.expected} | ${r.before} | ${r.after} | ${r.beforePass ? 'PASS' : 'FAIL'} | ${r.afterPass ? 'PASS' : 'FAIL'} | ${r.change} | ${r.contextRecords.join(', ')} | ${r.tokensBefore ?? 'n/a'} → ${r.tokensAfter ?? 'n/a'} |`,
  ),
  '',
]
writeFileSync(here('./COMPARISON.md'), `${lines.join('\n')}`)
console.log(`Accuracy ${mb.accuracyPercent}% → ${ma.accuracyPercent}%; improved: ${improvedIds.join(', ') || 'none'}; worse: ${worseIds.join(', ') || 'none'}. Written eval/COMPARISON.md`)
