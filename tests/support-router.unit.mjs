// Unit tests of the support router's pure logic with a fake model: input validation, validation
// of the model's answer, timeout and error handling, settings, and the keyword fallback on its own.
// No server and no network. Node 22.18 or newer runs the TypeScript module directly.
//
//   npm run test:support:unit        (writes SUPPORT_ROUTER_UNIT_EVIDENCE.md)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import {
  DECISION_QUESTIONS,
  DEFAULT_SETTINGS,
  buildDecisionRequest,
  describeError,
  keywordRoute,
  parseModelAnswers,
  readSettings,
  routeSupportRequest,
  validateSupportRequest,
} from '../src/support-router.ts'
import { ROUTING_CASES } from './support-cases.mjs'

const EVIDENCE_FILE = fileURLToPath(new URL('../SUPPORT_ROUTER_UNIT_EVIDENCE.md', import.meta.url))
const readJson = (relative) => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'))

// A raw answer of @cf/cloudflare/clef to the exact request the code builds for the message of
// routing case 2 (recorded, not written by hand; see the file's "description" and "recordedAt").
const FIXTURE = readJson('./fixtures/clef-answer-case-2.json')
const REAL_ANSWER = FIXTURE.answer
const REQUEST = FIXTURE.input
// The same decision request in the form TypeSafe's Jev API takes (docs/A6/jev-request.json).
const JEV_REQUEST = readJson('../docs/A6/jev-request.json')

// A copy of REAL_ANSWER with some fields replaced (deep enough for the tests here).
function variant(changes) {
  const copy = JSON.parse(JSON.stringify(REAL_ANSWER))
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split('.')
    let target = copy
    for (const key of keys.slice(0, -1)) target = target[key]
    if (value === undefined) delete target[keys.at(-1)]
    else target[keys.at(-1)] = value
  }
  return copy
}

const runner = (behaviour) => ({ run: behaviour })

const results = []
const samples = []
let group = ''
function check(name, passed, observed) {
  results.push({ group, name, passed: passed === true, observed: typeof observed === 'string' ? observed : JSON.stringify(observed) })
  console.log(`${passed === true ? 'PASS' : 'FAIL'}  ${group}: ${name}${passed === true ? '' : `  (${results.at(-1).observed})`}`)
}
const sample = (title, value) => samples.push({ title, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) })
const has = (errors, text) => Array.isArray(errors) && errors.some((e) => e.includes(text))

// ---------------------------------------------------------------------------------------
group = 'Input validation'

const valid = validateSupportRequest({ message: '  Hello  ', context: { equipmentId: ' eq-1 ', bookingId: 'b-1', other: 'ignored' } })
check('trims the message and the ids, ignores unknown properties', valid.ok && valid.value.message === 'Hello' && valid.value.context.equipmentId === 'eq-1' && valid.value.context.bookingId === 'b-1' && !('other' in valid.value.context), valid)
const noContext = validateSupportRequest({ message: 'Hi', context: {} })
check('an empty context is dropped', noContext.ok && !('context' in noContext.value), noContext)
const table = [
  [{}, 'message is required'],
  [{ message: '' }, 'message must be a non-empty string'],
  [{ message: 42 }, 'message must be a non-empty string'],
  [{ message: 'x'.repeat(2001) }, 'message must be at most 2000 characters'],
  [{ message: 'a\u0000b' }, 'message must not contain NUL characters'],
  [{ message: 'help\u001b[2Jme' }, 'message must not contain control characters'],
  [{ message: 'broken \ud800 projector' }, 'message must be valid Unicode text'],
  [{ message: 'hi', context: 'eq-1' }, 'context must be an object'],
  [{ message: 'hi', context: { equipmentId: '' } }, 'context.equipmentId must be a non-empty string'],
  [{ message: 'hi', context: { bookingId: 'y'.repeat(65) } }, 'context.bookingId must be at most 64 characters'],
  [null, 'Request body must be a valid JSON object'],
  [[], 'Request body must be a valid JSON object'],
  ['text', 'Request body must be a valid JSON object'],
]
for (const [body, expectedError] of table) {
  const result = validateSupportRequest(body)
  check(`rejects ${JSON.stringify(body)?.slice(0, 40)} with "${expectedError}"`, !result.ok && has(result.errors, expectedError), result)
}
const twoErrors = validateSupportRequest({ message: '', context: { equipmentId: 5 } })
check('reports every problem at once', !twoErrors.ok && twoErrors.errors.length === 2, twoErrors)
check('a message of exactly 2000 characters is accepted', validateSupportRequest({ message: 'x'.repeat(2000) }).ok, 'ok')
check('the length is counted after trimming (2000 characters plus spaces around them is accepted)', validateSupportRequest({ message: `  ${'x'.repeat(2000)}  ` }).ok, 'ok')
const del = validateSupportRequest({ message: 'help\u007fme' })
const c1 = validateSupportRequest({ message: 'help\u0085me' })
const lowHalf = validateSupportRequest({ message: '\udc00broken projector' })
check('DEL, C1 control characters and a lone low surrogate are rejected too', !del.ok && !c1.ok && !lowHalf.ok && has(lowHalf.errors, 'valid Unicode'), { del, c1, lowHalf })
const multiline = validateSupportRequest({ message: 'line one\nline two\tend 😞' })
check('tabs, line breaks and emoji (surrogate pairs) are accepted', multiline.ok, multiline)

// ---------------------------------------------------------------------------------------
group = 'Decision request'

const built = buildDecisionRequest(REQUEST)
check('sends the message and the equipment id as state, plus the three questions', built.model === 'clef' && built.state.message === REQUEST.message && built.state.equipmentId === 'eq-2' && built.state.bookingId === undefined && Object.keys(built.questions).join(',') === 'queue,urgency,needs_human', built)
check('without context the state has no ids', !('equipmentId' in buildDecisionRequest({ message: 'x' }).state), buildDecisionRequest({ message: 'x' }).state)
check('the choice criteria are exactly the four queues', Object.keys(DECISION_QUESTIONS.queue.criteria).join(',') === 'booking_change,equipment_fault,access_or_account,general_question', Object.keys(DECISION_QUESTIONS.queue.criteria))
check('the score has three levels (low, normal, high)', DECISION_QUESTIONS.urgency.criteria.length === 3, DECISION_QUESTIONS.urgency.criteria)
check('the recorded answer belongs to the request the code builds today (fixture is not stale)', isDeepStrictEqual(built, FIXTURE.request), { recorded: FIXTURE.request.state, now: built.state })
check('docs/A6/jev-request.json has the same state and questions, with a Jev model name', JEV_REQUEST.model === 'jev-latest' && isDeepStrictEqual(JEV_REQUEST.state, built.state) && isDeepStrictEqual(JEV_REQUEST.questions, DECISION_QUESTIONS), { model: JEV_REQUEST.model })
sample('The decision request sent to the model (buildDecisionRequest for routing case 2)', built)
sample(`The raw answer of @cf/cloudflare/clef to that request, recorded at ${FIXTURE.recordedAt} (tests/fixtures/clef-answer-case-2.json)`, REAL_ANSWER)

// ---------------------------------------------------------------------------------------
group = 'Answer validation'

const parsed = parseModelAnswers(REAL_ANSWER)
check('accepts the recorded Clef answer', parsed.ok && parsed.value.queue === 'equipment_fault' && parsed.value.confidence === REAL_ANSWER.answers.queue.confidence && parsed.value.urgencyProbabilities.high === REAL_ANSWER.answers.urgency.probabilities['2'] && parsed.value.needsHumanProbability === REAL_ANSWER.answers.needs_human.noul && parsed.value.inputTokens === REAL_ANSWER.usage.input_tokens && parsed.value.reportedModel === 'clef', parsed)
const noConfidence = parseModelAnswers(variant({ 'answers.queue.confidence': undefined }))
check('without a confidence field, the probability of the chosen queue is used', noConfidence.ok && noConfidence.value.confidence === REAL_ANSWER.answers.queue.probabilities.equipment_fault, noConfidence)
const sum104 = parseModelAnswers(variant({ 'answers.queue.probabilities.general_question': 0.0454 }))
const sum090 = parseModelAnswers(variant({ 'answers.queue.probabilities.equipment_fault': 0.88 }))
check('probabilities must add up to 1 within 0.05 (a sum of 1.04 is accepted, 0.90 is rejected)', sum104.ok && !sum090.ok, { sum104: sum104.ok, sum090: sum090.ok && 'accepted' })
const tied = parseModelAnswers(variant({ 'answers.queue.choice': 'booking_change', 'answers.queue.probabilities': { booking_change: 0.49, equipment_fault: 0.49, access_or_account: 0.01, general_question: 0.01 } }))
const runnerUp = parseModelAnswers(variant({ 'answers.queue.choice': 'booking_change', 'answers.queue.probabilities': { booking_change: 0.3, equipment_fault: 0.68, access_or_account: 0.01, general_question: 0.01 } }))
check('a choice tied for the highest probability is accepted; a runner-up choice (0.30 against 0.68) is rejected', tied.ok && !runnerUp.ok, { tied: tied.ok, runnerUp: runnerUp.ok })
const badAnswers = [
  ['a label that is not a queue', variant({ 'answers.queue.choice': 'refunds' }), 'is not one of'],
  ['a chosen label that is not the most probable one', variant({ 'answers.queue.choice': 'general_question' }), 'is not the most probable queue'],
  ['a missing queue probability', variant({ 'answers.queue.probabilities.general_question': undefined }), 'general_question is not a probability'],
  ['queue probabilities that do not add up to 1', variant({ 'answers.queue.probabilities.equipment_fault': 0.2 }), 'add up to'],
  ['a probability above 1', variant({ 'answers.queue.confidence': 1.5 }), 'confidence is not a probability'],
  ['an urgency score outside 0..2', variant({ 'answers.urgency.score': 2.5 }), 'score must be a number from 0 to 2'],
  ['an urgency without probabilities', variant({ 'answers.urgency.probabilities': undefined }), 'answers.urgency.probabilities is missing'],
  ['a needs_human value that is not a probability', variant({ 'answers.needs_human.noul': 'yes' }), 'needs_human is not a noul answer'],
  ['a wrong answer type', variant({ 'answers.queue.type': 'score' }), 'answers.queue is not a choice answer'],
  ['no answers at all', { model: 'clef' }, 'no "answers" object'],
  ['a plain string', 'equipment_fault', 'no "answers" object'],
  ['null', null, 'no "answers" object'],
]
for (const [what, raw, expectedProblem] of badAnswers) {
  const result = parseModelAnswers(raw)
  check(`rejects ${what}`, !result.ok && result.problem.includes(expectedProblem), result)
}

// ---------------------------------------------------------------------------------------
group = 'Routing with a fake model'

// Every fallback writes one warning to the server log. Collect them instead of printing them.
const warnings = []
const fallbacks = []
const realWarn = console.warn
console.warn = (...args) => warnings.push(args.join(' '))
const route = async (...args) => {
  const decision = await routeSupportRequest(...args)
  if (decision.source === 'fallback') fallbacks.push(decision)
  return decision
}

const settings = { ...DEFAULT_SETTINGS, timeoutMs: 50 }

const unavailable = await route(REQUEST, null, settings)
check('no model binding: fallback, model_unavailable, a person must look', unavailable.source === 'fallback' && unavailable.fallbackReason === 'model_unavailable' && unavailable.needsHuman === true && unavailable.model === null && unavailable.confidence === 0, unavailable)

const aiError = Object.assign(new Error('5007: No such model @cf/cloudflare/no-such-model or task'), { name: 'AiError' })
const failed = await route(REQUEST, runner(async () => { throw aiError }), settings)
check('model call throws: fallback, model_error, the error is named in the reasons', failed.source === 'fallback' && failed.fallbackReason === 'model_error' && failed.details.reasons[0].includes('AiError: 5007'), failed)
sample('Fallback decision when the model call fails (model_error)', failed)

const htmlPage = Object.assign(new Error(`<!DOCTYPE html>\n<html>${'<p>upstream error</p>\n'.repeat(3000)}</html>`), { name: 'InferenceUpstreamError' })
const htmlFailure = await route(REQUEST, runner(async () => { throw htmlPage }), settings)
check('a huge error text from the service is cut to one short line in the decision', htmlFailure.fallbackReason === 'model_error' && htmlFailure.details.reasons[0].length <= 250 && !/[\n\r]/.test(htmlFailure.details.reasons[0]), { length: htmlFailure.details.reasons[0].length, start: htmlFailure.details.reasons[0].slice(0, 80) })

const hang = runner(() => new Promise(() => {}))
const timedOut = await route(REQUEST, hang, settings)
check('model never answers: fallback after the timeout, model_timeout', timedOut.source === 'fallback' && timedOut.fallbackReason === 'model_timeout' && timedOut.details.latencyMs >= 50 && timedOut.details.latencyMs < 5000, { fallbackReason: timedOut.fallbackReason, latencyMs: timedOut.details.latencyMs })
sample('Fallback decision when the model does not answer in time (model_timeout, 50 ms limit in this test)', timedOut)

const lying = runner(async () => variant({ 'answers.queue.choice': 'refunds' }))
const invalid = await route(REQUEST, lying, settings)
check('model answers with an unknown label: fallback, invalid_model_output', invalid.source === 'fallback' && invalid.fallbackReason === 'invalid_model_output' && invalid.details.reasons[0].includes('refunds'), invalid)

const contradicting = runner(async () => variant({ 'answers.queue.choice': 'general_question' }))
const contradictionDecision = await route(REQUEST, contradicting, settings)
check('model picks a label its own probabilities rank low: fallback, invalid_model_output', contradictionDecision.fallbackReason === 'invalid_model_output' && contradictionDecision.details.reasons[0].includes('not the most probable'), contradictionDecision.details.reasons[0])

const garbage = runner(async () => 'equipment_fault')
const garbageDecision = await route(REQUEST, garbage, settings)
check('model answers with plain text: fallback, invalid_model_output', garbageDecision.source === 'fallback' && garbageDecision.fallbackReason === 'invalid_model_output', garbageDecision.fallbackReason)

let seen
const good = runner(async (model, input) => { seen = { model, input }; return REAL_ANSWER })
const decided = await route(REQUEST, good, settings)
check('the model is called with the configured id and the built request', seen?.model === '@cf/cloudflare/clef' && seen.input.model === 'clef' && seen.input.state.message === REQUEST.message && seen.input.questions === DECISION_QUESTIONS, seen && { model: seen.model, state: seen.input.state })
check(
  `the recorded answer becomes a model decision: equipment_fault, high, person (noul ${REAL_ANSWER.answers.needs_human.noul} >= 0.5), confidence ${REAL_ANSWER.answers.queue.confidence}`,
  decided.source === 'model' && decided.queue === 'equipment_fault' && decided.urgency === 'high' && decided.needsHuman === true && decided.confidence === REAL_ANSWER.answers.queue.confidence && decided.model === '@cf/cloudflare/clef' && decided.fallbackReason === null && decided.details.inputTokens === REAL_ANSWER.usage.input_tokens,
  decided,
)
sample('Model decision built from the recorded answer', decided)

const unsure = runner(async () => variant({ 'answers.queue.confidence': 0.4, 'answers.needs_human.noul': 0.1 }))
const unsureDecision = await route(REQUEST, unsure, settings)
check('confidence below the threshold (0.4 < 0.6): the queue is kept but a person must look', unsureDecision.source === 'model' && unsureDecision.needsHuman === true && unsureDecision.details.reasons.some((r) => r.includes('below the threshold')), unsureDecision.details.reasons)

const confident = runner(async () => variant({ 'answers.needs_human.noul': 0.1 }))
const confidentDecision = await route(REQUEST, confident, settings)
check('confident answer and noul 0.1: handled automatically', confidentDecision.source === 'model' && confidentDecision.needsHuman === false && confidentDecision.details.reasons.length === 0, confidentDecision.details.reasons)

const borderline = await route(REQUEST, runner(async () => variant({ 'answers.needs_human.noul': 0.5 })), settings)
check('noul exactly 0.5 already asks for a person (the rule is 0.5 or more)', borderline.needsHuman === true, borderline.details.reasons)

const spread = runner(async () => variant({ 'answers.urgency.probabilities': { 0: 0.45, 1: 0.1, 2: 0.45 }, 'answers.urgency.score': 1.0 }))
const spreadDecision = await route(REQUEST, spread, settings)
check('urgency is the most probable level, not the rounded score (0.45 / 0.10 / 0.45 -> low, first on a tie)', spreadDecision.urgency === 'low' && spreadDecision.details.urgencyScore === 1.0, { urgency: spreadDecision.urgency, score: spreadDecision.details.urgencyScore })

console.warn = realWarn
check(
  'every fallback decision wrote one warning to the server log, and no warning contains the message text',
  warnings.length === fallbacks.length && warnings.every((w) => w.startsWith('support router: fallback decision (') && !w.includes(REQUEST.message)),
  { warnings: warnings.length, fallbacks: fallbacks.length, first: warnings[0]?.slice(0, 120) },
)

// ---------------------------------------------------------------------------------------
group = 'Error text'

check('an Error becomes "name: message"', describeError(aiError) === 'AiError: 5007: No such model @cf/cloudflare/no-such-model or task', describeError(aiError))
check('an object that is not an Error is shown as JSON, not "[object Object]"', describeError({ code: 3040, message: 'Capacity' }) === '{"code":3040,"message":"Capacity"}', describeError({ code: 3040, message: 'Capacity' }))
check('control characters and line breaks become spaces', describeError('line one\nline two\u001b[2J') === 'line one line two [2J', describeError('line one\nline two\u001b[2J'))
const long = describeError('x'.repeat(50_000))
check('a long text is cut to 200 characters plus "..."', long.length === 203 && long.endsWith('...'), long.length)
const emojiCut = describeError(`${'x'.repeat(199)}\u{1F600}tail`)
check('the cut never splits an emoji in half (it counts characters, not UTF-16 units)', emojiCut === `${'x'.repeat(199)}\u{1F600}...`, emojiCut.slice(-6))

// ---------------------------------------------------------------------------------------
group = 'Settings'

const defaults = readSettings({})
check('defaults when nothing is configured', defaults.model === '@cf/cloudflare/clef' && defaults.timeoutMs === 8000 && defaults.minConfidence === 0.6, defaults)
const custom = readSettings({ ROUTER_MODEL: ' @cf/other ', ROUTER_TIMEOUT_MS: '250', ROUTER_MIN_CONFIDENCE: '0.8' })
check('configured values are read', custom.model === '@cf/other' && custom.timeoutMs === 250 && custom.minConfidence === 0.8, custom)
const broken = readSettings({ ROUTER_MODEL: '  ', ROUTER_TIMEOUT_MS: 'soon', ROUTER_MIN_CONFIDENCE: '7' })
check('unusable values fall back to the defaults', broken.model === '@cf/cloudflare/clef' && broken.timeoutMs === 8000 && broken.minConfidence === 0.6, broken)
const blank = readSettings({ ROUTER_TIMEOUT_MS: '', ROUTER_MIN_CONFIDENCE: '' })
const spaces = readSettings({ ROUTER_TIMEOUT_MS: '   ', ROUTER_MIN_CONFIDENCE: '   ' })
check('blank or whitespace-only values keep the defaults (not 0)', blank.timeoutMs === 8000 && blank.minConfidence === 0.6 && spaces.timeoutMs === 8000 && spaces.minConfidence === 0.6, { blank, spaces })
const exotic = readSettings({ ROUTER_TIMEOUT_MS: '0x10', ROUTER_MIN_CONFIDENCE: '0b1' })
const exponent = readSettings({ ROUTER_TIMEOUT_MS: '1e3' })
check('hexadecimal, binary and exponent notation are not read as numbers', exotic.timeoutMs === 8000 && exotic.minConfidence === 0.6 && exponent.timeoutMs === 8000, { exotic, exponent })
const tooLong = readSettings({ ROUTER_TIMEOUT_MS: '2147483648' })
const justOver = readSettings({ ROUTER_TIMEOUT_MS: '60001' })
const zeroTimeout = readSettings({ ROUTER_TIMEOUT_MS: '0' })
const minTimeout = readSettings({ ROUTER_TIMEOUT_MS: '1' })
const maxTimeout = readSettings({ ROUTER_TIMEOUT_MS: '60000' })
check(
  'the timeout must be 1 to 60000 ms (1 and 60000 accepted; 0, 60001 and 2147483648 replaced by the default)',
  tooLong.timeoutMs === 8000 && justOver.timeoutMs === 8000 && zeroTimeout.timeoutMs === 8000 && minTimeout.timeoutMs === 1 && maxTimeout.timeoutMs === 60000,
  { tooLong: tooLong.timeoutMs, justOver: justOver.timeoutMs, zero: zeroTimeout.timeoutMs, min: minTimeout.timeoutMs, max: maxTimeout.timeoutMs },
)
const gateOff = readSettings({ ROUTER_MIN_CONFIDENCE: '0' })
check('an explicit 0 for the confidence threshold is accepted (gate switched off on purpose)', gateOff.minConfidence === 0, gateOff)

// ---------------------------------------------------------------------------------------
group = 'Keyword fallback'

const deadline = keywordRoute('The deadline for the form is tomorrow')
check('"dead" does not match inside "deadline" (single words match whole words only)', deadline.queue === 'general_question' && deadline.matched.length === 0, deadline)
check('a message that matches nothing is a low-urgency general question', keywordRoute('asdf qwerty zxcv').queue === 'general_question' && keywordRoute('asdf qwerty zxcv').urgency === 'low', keywordRoute('asdf qwerty zxcv'))
check('Thai fault words are recognised', keywordRoute('โปรเจคเตอร์ห้อง 301 เปิดไม่ติดค่ะ มีสอนบ่ายนี้').queue === 'equipment_fault', keywordRoute('โปรเจคเตอร์ห้อง 301 เปิดไม่ติดค่ะ มีสอนบ่ายนี้'))
check('on a tie, a fault beats a booking change', keywordRoute('cancel it, the camera is broken').queue === 'equipment_fault', keywordRoute('cancel it, the camera is broken'))
const password = keywordRoute("My password doesn't work")
const thaiPassword = keywordRoute('รหัสผ่านใช้ไม่ได้')
const projector = keywordRoute('The projector doesn’t work')
check('on a tie, an access problem beats a fault ("my password doesn\'t work"), and a plain fault stays a fault', password.queue === 'access_or_account' && thaiPassword.queue === 'access_or_account' && projector.queue === 'equipment_fault', { password: password.queue, thaiPassword: thaiPassword.queue, projector: projector.queue })
const curly = keywordRoute('The projector in room 301 doesn’t work')
check('a typographic apostrophe (doesn’t) matches like a plain one', curly.queue === 'equipment_fault' && curly.matched.some((m) => m.includes("doesn't work")), curly)
const hidden = keywordRoute('bro​ken projector')
check('a zero-width character inside a word does not hide it', hidden.queue === 'equipment_fault', hidden)
const cancelled = keywordRoute('My booking got cancelled')
const rescheduled = keywordRoute('Can it be rescheduled?')
check('common inflections are recognised (cancelled, rescheduled)', cancelled.queue === 'booking_change' && rescheduled.queue === 'booking_change', { cancelled, rescheduled })
const thaiBroken = keywordRoute('โปรเจคเตอร์เสีย')
const thaiSorry = keywordRoute('ขอเปลี่ยนเวลาจองเป็นพรุ่งนี้ เสียใจด้วยที่แจ้งช้า')
const thaiNoSound = keywordRoute('ไมค์ไม่มีเสียง')
check('Thai เสีย means broken, but not inside เสียใจ (sorry); ไม่มีเสียง (no sound) is a fault', thaiBroken.queue === 'equipment_fault' && thaiSorry.queue === 'booking_change' && thaiNoSound.queue === 'equipment_fault', { thaiBroken, thaiSorry, thaiNoSound })
const thaiFine = keywordRoute('ถ้ายกเลิกการจองต้องเสียค่าปรับไหม')
const thaiCost = keywordRoute('จองห้องประชุมต้องเสียเงินไหม')
const thaiDamaged = keywordRoute('โปรเจคเตอร์เสียหาย')
check('Thai fee words (เสียค่าปรับ, เสียเงิน) are not "broken", but เสียหาย (damaged) is', thaiFine.queue === 'booking_change' && thaiCost.queue === 'general_question' && thaiDamaged.queue === 'equipment_fault', { thaiFine: thaiFine.queue, thaiCost: thaiCost.queue, thaiDamaged: thaiDamaged.queue })

const ruleRows = ROUTING_CASES.map((rc, i) => {
  const rules = keywordRoute(rc.message)
  return { number: i + 1, message: rc.message, expected: rc.expect, rules, queueAgrees: rules.queue === rc.expect.queue, urgencyAgrees: rules.urgency === rc.expect.urgency }
})
const queueAgreement = ruleRows.filter((r) => r.queueAgrees).length
const urgencyAgreement = ruleRows.filter((r) => r.urgencyAgrees).length
console.log(`note  the keyword rules alone agree with the expected queue in ${queueAgreement} of ${ruleRows.length} routing inputs, and with the expected urgency in ${urgencyAgreement}`)

// ---------------------------------------------------------------------------------------
// Evidence file

const passedCount = results.filter((r) => r.passed).length
const failedCount = results.length - passedCount
const esc = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const lines = [
  '# Support Router Unit Test Evidence',
  '',
  `- **Result:** ${passedCount} passed, ${failedCount} failed (${results.length} checks)`,
  `- **Run at:** ${new Date().toISOString()} with Node.js ${process.version}`,
  '- **How it was run:** `npm run test:support:unit` (`tests/support-router.unit.mjs`). No server and no network: the model is replaced by fakes that fail, hang, or answer wrongly.',
  `- **Recorded answer:** \`tests/fixtures/clef-answer-case-2.json\` holds a raw answer of \`@cf/cloudflare/clef\`, recorded at ${FIXTURE.recordedAt} for the exact decision request shown under Samples (the message of routing case 2). One check confirms that the code still builds that request, so the fixture cannot silently go stale. The same request is answered live in case 2 of SUPPORT_ROUTER_EVIDENCE.md.`,
  '',
  '## Checks',
  '',
  '| # | Group | Check | Result |',
  '|--:|-------|-------|--------|',
  ...results.map((r, i) => `| ${i + 1} | ${r.group} | ${esc(r.name)} | ${r.passed ? 'PASS' : `**FAIL** (${esc(r.observed.slice(0, 300))})`} |`),
  '',
  '## Keyword rules compared with the expected decisions',
  '',
  `This is what the fallback decides on its own for the ${ruleRows.length} routing inputs of the HTTP tests. It is a comparison, not a check:`,
  `the rules agree with the expected queue in ${queueAgreement} of ${ruleRows.length} inputs and with the expected urgency in ${urgencyAgreement} of ${ruleRows.length}.`,
  '',
  '| # | Input | Expected queue / urgency | Keyword rules: queue / urgency | Matched | Queue agrees |',
  '|--:|-------|--------------------------|--------------------------------|---------|:------------:|',
  ...ruleRows.map(
    (r) =>
      `| ${r.number} | ${esc(r.message)} | ${r.expected.queue} / ${r.expected.urgency} | ${r.rules.queue} / ${r.rules.urgency} | ${esc(r.rules.matched.join('; ')) || '(nothing)'} | ${r.queueAgrees ? 'yes' : '**no**'} |`,
  ),
  '',
  '## Samples',
]
for (const s of samples) lines.push('', `### ${s.title}`, '', '```json', s.text, '```')
writeFileSync(EVIDENCE_FILE, `${lines.join('\n')}\n`)

console.log(`\n${passedCount} passed, ${failedCount} failed. Evidence written to SUPPORT_ROUTER_UNIT_EVIDENCE.md`)
process.exitCode = failedCount === 0 ? 0 : 1
