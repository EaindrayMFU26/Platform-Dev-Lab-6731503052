// Unit tests of the A7 improvement: the knowledge base, the retrieval of grounding context, how it
// is put into the request to the model, and the ROUTER_GROUNDING setting. No server, no network.
//
//   npm run test:grounding:unit        (writes eval/GROUNDING_UNIT_EVIDENCE.md)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { KNOWLEDGE_BASE, MAX_RETRIEVED, selectGuidelines } from '../src/grounding.ts'
import { DECISION_QUESTIONS, DEFAULT_SETTINGS, buildDecisionRequest, readSettings, routeSupportRequest } from '../src/support-router.ts'

const EVIDENCE_FILE = fileURLToPath(new URL('../eval/GROUNDING_UNIT_EVIDENCE.md', import.meta.url))
const readJson = (relative) => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'))
const FIXTURE = readJson('./fixtures/clef-answer-case-2.json') // the A6 request and the model's answer to it
const DATASET = readJson('../eval/eval-cases.json')

const results = []
const samples = []
let group = ''
function check(name, passed, observed) {
  results.push({ group, name, passed: passed === true, observed: typeof observed === 'string' ? observed : JSON.stringify(observed) })
  console.log(`${passed === true ? 'PASS' : 'FAIL'}  ${group}: ${name}${passed === true ? '' : `  (${results.at(-1).observed})`}`)
}
const ids = (guidelines) => guidelines.map((g) => g.id)

// ---------------------------------------------------------------------------------------
group = 'Knowledge base'

const recordIds = KNOWLEDGE_BASE.map((r) => r.id)
check('has at least 5 records, each with a unique id, a title, a text and a keyword list', KNOWLEDGE_BASE.length >= 5 && new Set(recordIds).size === recordIds.length && KNOWLEDGE_BASE.every((r) => r.title && r.text && Array.isArray(r.keywords)), { count: KNOWLEDGE_BASE.length, recordIds })
const always = KNOWLEDGE_BASE.filter((r) => r.always).map((r) => r.id)
check('exactly two records are always included: KB05 (urgency levels) and KB07 (when a person must read)', isDeepStrictEqual(always, ['KB05', 'KB07']), always)
check('every other record has keywords to be found by', KNOWLEDGE_BASE.filter((r) => !r.always).every((r) => r.keywords.length > 0), 'ok')

// ---------------------------------------------------------------------------------------
group = 'Retrieval'

const nothing = selectGuidelines('asdf qwerty zxcv')
check('a message without any keyword gets only the two records that are always included', isDeepStrictEqual(ids(nothing.guidelines), ['KB05', 'KB07']), ids(nothing.guidelines))
const many = selectGuidelines('cancel broken password bus')
check(`at most ${MAX_RETRIEVED} topic records are added; on a tie the record listed first wins`, isDeepStrictEqual(ids(many.guidelines), ['KB01', 'KB02', 'KB03', 'KB05', 'KB07']), ids(many.guidelines))
check('the model sees only id, title and text of a record, not its keywords', many.guidelines.every((g) => isDeepStrictEqual(Object.keys(g), ['id', 'title', 'text'])), Object.keys(many.guidelines[0]))
const ranked = selectGuidelines('cancel, broken, password, bus: I was charged a fine and want a refund')
check('records are ranked by keyword hits: KB09 (3 hits, listed last) comes in, and of the four records with 1 hit only the two listed first (KB01, KB02) do', isDeepStrictEqual(ids(ranked.guidelines), ['KB01', 'KB02', 'KB05', 'KB07', 'KB09']), { selected: ids(ranked.guidelines), scores: ranked.scores.filter((s) => s.hits.length) })
const thai = selectGuidelines('ขอยกเลิกการจองห้องประชุม C วันศุกร์นี้ค่ะ')
check('Thai keywords are found (ยกเลิก, จอง: booking changes; ห้องประชุม: rooms)', ids(thai.guidelines).includes('KB01') && ids(thai.guidelines).includes('KB10'), ids(thai.guidelines))
const withId = selectGuidelines('it is broken', 'eq-2')
check('the equipment id from the context counts as text to search (eq-2 finds the equipment record)', ids(withId.guidelines).includes('KB10'), ids(withId.guidelines))
const curly = selectGuidelines('The projector doesn\u2019t work')
check('the same normalisation as the fallback: a typographic apostrophe still finds "doesn\'t work"', curly.scores.find((s) => s.id === 'KB02').hits.includes("doesn't work"), curly.scores.find((s) => s.id === 'KB02'))

// ---------------------------------------------------------------------------------------
group = 'Request to the model'

const off = buildDecisionRequest(FIXTURE.input, false)
check('with grounding off the request is exactly the recorded A6 request (the baseline is the A6 capability)', isDeepStrictEqual(off, FIXTURE.request) && JSON.stringify(off) === JSON.stringify(FIXTURE.request), { state: off.state })
check('grounding is off unless asked for: buildDecisionRequest(input) without the flag equals the A6 request too', isDeepStrictEqual(buildDecisionRequest(FIXTURE.input), FIXTURE.request), 'ok')
const on = buildDecisionRequest(FIXTURE.input, true)
const { guidelines, ...stateWithoutGuidelines } = on.state
check('with grounding on, only state.guidelines is added: the A6 state fields come first and unchanged, and the questions are the same object', isDeepStrictEqual(stateWithoutGuidelines, FIXTURE.request.state) && Object.keys(on.state).at(-1) === 'guidelines' && on.questions === DECISION_QUESTIONS && isDeepStrictEqual(on.questions, FIXTURE.request.questions) && on.model === 'clef', Object.keys(on.state))
check('the guidelines sent are the ones selectGuidelines() picks for that message and equipment id', isDeepStrictEqual(guidelines, selectGuidelines(FIXTURE.input.message, FIXTURE.input.context.equipmentId).guidelines), ids(guidelines))
samples.push({ title: 'The request with grounding on, for the message of A6 routing case 2', text: JSON.stringify({ ...on, questions: '(the three questions, unchanged)' }, null, 2) })

// ---------------------------------------------------------------------------------------
group = 'Setting'

check('ROUTER_GROUNDING "on" (any case, spaces allowed) switches grounding on', readSettings({ ROUTER_GROUNDING: 'on' }).grounding === true && readSettings({ ROUTER_GROUNDING: ' ON ' }).grounding === true, 'ok')
const offValues = [undefined, '', 'off', 'yes', 'true', '1']
check('anything else keeps it off (unset, "", "off", "yes", "true", "1"), and the default is off', offValues.every((v) => readSettings({ ROUTER_GROUNDING: v }).grounding === false) && DEFAULT_SETTINGS.grounding === false, offValues.map((v) => readSettings({ ROUTER_GROUNDING: v }).grounding))
check('the A6 settings are read as before', readSettings({}).timeoutMs === 8000 && readSettings({}).minConfidence === 0.6 && readSettings({}).model === '@cf/cloudflare/clef', readSettings({}))

// ---------------------------------------------------------------------------------------
group = 'Decisions'

const realWarn = console.warn
console.warn = () => {} // a fallback writes a warning; not needed here
let seen
const answering = { run: async (model, input) => { seen = input; return FIXTURE.answer } }
const grounded = await routeSupportRequest(FIXTURE.input, answering, { ...DEFAULT_SETTINGS, grounding: true })
check('a model decision with grounding lists the records it sent in details.contextRecords', isDeepStrictEqual(grounded.details.contextRecords, ids(seen.state.guidelines)) && grounded.details.contextRecords.length > 0, grounded.details.contextRecords)
const plain = await routeSupportRequest(FIXTURE.input, answering, DEFAULT_SETTINGS)
check('without grounding the model gets the A6 request and contextRecords is empty', isDeepStrictEqual(seen, FIXTURE.request) && isDeepStrictEqual(plain.details.contextRecords, []), plain.details.contextRecords)
check('apart from contextRecords, the decision for the same answer is the same with and without grounding', isDeepStrictEqual({ ...grounded, details: { ...grounded.details, latencyMs: 0, contextRecords: [] } }, { ...plain, details: { ...plain.details, latencyMs: 0 } }), 'ok')
const failing = { run: async () => { throw new Error('5007: No such model') } }
const failed = await routeSupportRequest(FIXTURE.input, failing, { ...DEFAULT_SETTINGS, grounding: true })
check('a fallback after a failed call still lists the records that were sent with the failed request', failed.source === 'fallback' && failed.details.contextRecords.length > 0, failed.details.contextRecords)
const unavailable = await routeSupportRequest(FIXTURE.input, null, { ...DEFAULT_SETTINGS, grounding: true })
check('with no model binding nothing is sent, so contextRecords is empty', unavailable.fallbackReason === 'model_unavailable' && unavailable.details.contextRecords.length === 0, unavailable.details.contextRecords)
console.warn = realWarn

// ---------------------------------------------------------------------------------------
// What the retrieval picks for the 10 evaluation cases (a record, not a check)

const retrievalRows = DATASET.cases.map((c) => {
  const r = selectGuidelines(c.input.message, c.input.context?.equipmentId)
  const hits = r.scores.filter((s) => s.hits.length).map((s) => `${s.id}: ${s.hits.join(', ')}`)
  return { id: c.id, message: c.input.message, selected: ids(r.guidelines), hits }
})
for (const row of retrievalRows) console.log(`note  ${row.id} -> ${row.selected.join(', ')}`)

// ---------------------------------------------------------------------------------------
// Evidence file

const passedCount = results.filter((r) => r.passed).length
const failedCount = results.length - passedCount
const esc = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const lines = [
  '# A7 Grounding Unit Test Evidence',
  '',
  `- **Result:** ${passedCount} passed, ${failedCount} failed (${results.length} checks)`,
  `- **Run at:** ${new Date().toISOString()} with Node.js ${process.version}`,
  '- **How it was run:** `npm run test:grounding:unit` (`tests/grounding.unit.mjs`). No server and no network; the model is replaced by fakes, and the recorded A6 request and answer come from `tests/fixtures/clef-answer-case-2.json`.',
  '',
  '## Checks',
  '',
  '| # | Group | Check | Result |',
  '|--:|-------|-------|--------|',
  ...results.map((r, i) => `| ${i + 1} | ${r.group} | ${esc(r.name)} | ${r.passed ? 'PASS' : `**FAIL** (${esc(r.observed.slice(0, 300))})`} |`),
  '',
  '## What the retrieval selects for the evaluation cases',
  '',
  'The records sent to the model with ROUTER_GROUNDING on: KB05 and KB07 always, plus up to three topic records by keyword hits. This is a record of the selection, not a check.',
  '',
  '| ID | Message | Records sent | Keyword hits |',
  '|----|---------|--------------|--------------|',
  ...retrievalRows.map((r) => `| ${r.id} | ${esc(r.message)} | ${r.selected.join(', ')} | ${esc(r.hits.join('; ')) || '(none)'} |`),
  '',
  '## Samples',
]
for (const s of samples) lines.push('', `### ${s.title}`, '', '```json', s.text, '```')
writeFileSync(EVIDENCE_FILE, `${lines.join('\n')}\n`)

console.log(`\n${passedCount} passed, ${failedCount} failed. Evidence written to eval/GROUNDING_UNIT_EVIDENCE.md`)
process.exitCode = failedCount === 0 ? 0 : 1
