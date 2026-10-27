// Support-request router: the AI decision capability of assignment A6.
//
// A support message about the booking service arrives as free text. The router decides three
// things, each a typed question to a System One decision model:
//
//   queue        choice   which team handles the message
//   urgency      score    low / normal / high
//   needs_human  noul     must a person read it before anything happens automatically?
//
// The model is Cloudflare Workers AI "@cf/cloudflare/clef". It speaks the same typed
// question/answer protocol as TypeSafe's Jev (choice, score and noul questions; answers that
// carry probabilities instead of prose). The same state and questions can be sent to Jev; only
// the model name in the body changes (docs/A6/jev-request.json). Whatever the model returns is
// validated against a fixed schema. When the model is unavailable, too slow, or answers with
// something that does not fit, deterministic keyword rules decide instead, say so in the
// result, and always ask for a person.
//
// No HTTP and no database in this file. The routes in index.ts call routeSupportRequest() and
// store the result. The model is reached through the small ModelRunner interface, so tests can
// replace it with a fake that fails, hangs or lies.

import type { Validated } from './validation'

export const QUEUES = ['booking_change', 'equipment_fault', 'access_or_account', 'general_question'] as const
export type Queue = (typeof QUEUES)[number]

// Index = score level: 0 low, 1 normal, 2 high.
export const URGENCIES = ['low', 'normal', 'high'] as const
export type Urgency = (typeof URGENCIES)[number]

export type SupportRequest = {
  message: string
  context?: { equipmentId?: string; bookingId?: string }
}

export type FallbackReason = 'model_unavailable' | 'model_error' | 'model_timeout' | 'invalid_model_output'

/** The structured result. The model path and the fallback path both produce exactly this shape. */
export type RoutingDecision = {
  queue: Queue
  urgency: Urgency
  needsHuman: boolean
  /** The model's confidence in the queue, 0 to 1. The fallback has no probabilities and reports 0. */
  confidence: number
  source: 'model' | 'fallback'
  /** The configured model id when the model decided, null for the fallback. */
  model: string | null
  fallbackReason: FallbackReason | null
  details: {
    queueProbabilities: Record<Queue, number>
    /** Probability-weighted urgency from 0 (low) to 2 (high). */
    urgencyScore: number
    urgencyProbabilities: Record<Urgency, number>
    needsHumanProbability: number
    /** Why a person is needed, or why the fallback decided and what it matched. */
    reasons: string[]
    latencyMs: number
    inputTokens: number | null
    /** The model name reported in the answer, for example "clef" or "typesafe/jev-1.14". */
    reportedModel: string | null
  }
}

// ---------------------------------------------------------------------------------------
// Decision configuration: the questions the model answers
// ---------------------------------------------------------------------------------------

type Questions = {
  queue: { type: 'choice'; instructions: string; criteria: Record<Queue, string> }
  urgency: { type: 'score'; instructions: string; criteria: readonly [string, string, string] }
  needs_human: { type: 'noul'; instructions: string }
}

export const DECISION_QUESTIONS: Questions = {
  queue: {
    type: 'choice',
    instructions: 'Which support queue should handle this message sent to the campus equipment booking service?',
    criteria: {
      booking_change:
        'The sender wants to create, move, extend, shorten or cancel a booking, or reports a booking conflict or double booking',
      equipment_fault: 'The equipment or room facilities are broken, missing, damaged or not working',
      access_or_account:
        'The sender cannot log in, is not authorised, or has an account, student ID or permission problem with the booking system',
      general_question:
        'A question about rules, availability, policies or how to use the service, or anything that fits no other queue',
    },
  },
  urgency: {
    type: 'score',
    instructions: 'How urgent is this message?',
    criteria: [
      'Low: no deadline mentioned, can wait several days',
      'Normal: should be handled within one working day',
      'High: the sender is blocked right now or within the next few hours',
    ],
  },
  needs_human: {
    type: 'noul',
    instructions:
      'A staff member must read this message personally before any automatic action is taken, for example because it is ambiguous, a complaint, a safety problem, or fits no queue well.',
  },
}

/** The request body sent to the model: the state to judge plus the questions above. */
export type DecisionRequest = {
  /** Clef's own model selector inside the body. Jev takes a Jev model name here, e.g. "jev-latest". */
  model: 'clef'
  state: { service: string; message: string; equipmentId?: string; bookingId?: string }
  questions: Questions
}

export function buildDecisionRequest(request: SupportRequest): DecisionRequest {
  const state: DecisionRequest['state'] = {
    service: 'Campus Equipment Booking (projectors, cameras, meeting rooms)',
    message: request.message,
  }
  if (request.context?.equipmentId) state.equipmentId = request.context.equipmentId
  if (request.context?.bookingId) state.bookingId = request.context.bookingId
  return { model: 'clef', state, questions: DECISION_QUESTIONS }
}

// ---------------------------------------------------------------------------------------
// Settings and the model interface
// ---------------------------------------------------------------------------------------

export type RouterSettings = {
  /** Workers AI model id. */
  model: string
  /** After this long without an answer the fallback decides. 1 to 60000 ms. */
  timeoutMs: number
  /** Below this confidence in the queue, a person must look even if the model answered. 0 to 1. */
  minConfidence: number
}

export const DEFAULT_SETTINGS: RouterSettings = { model: '@cf/cloudflare/clef', timeoutMs: 8000, minConfidence: 0.6 }
const MAX_TIMEOUT_MS = 60_000

// Only plain decimal numbers count. Number() alone would turn '' and '  ' into 0 and '0x10' into 16.
function readNumber(text: string | undefined, pattern: RegExp): number {
  const value = text?.trim() ?? ''
  return pattern.test(value) ? Number(value) : Number.NaN
}

/** Reads ROUTER_MODEL, ROUTER_TIMEOUT_MS and ROUTER_MIN_CONFIDENCE. Anything missing, blank or out of range keeps its default. */
export function readSettings(env: { ROUTER_MODEL?: string; ROUTER_TIMEOUT_MS?: string; ROUTER_MIN_CONFIDENCE?: string }): RouterSettings {
  const timeoutMs = readNumber(env.ROUTER_TIMEOUT_MS, /^\d+$/)
  const minConfidence = readNumber(env.ROUTER_MIN_CONFIDENCE, /^(\d+\.?\d*|\.\d+)$/)
  return {
    model: env.ROUTER_MODEL?.trim() || DEFAULT_SETTINGS.model,
    timeoutMs: timeoutMs >= 1 && timeoutMs <= MAX_TIMEOUT_MS ? timeoutMs : DEFAULT_SETTINGS.timeoutMs,
    minConfidence: minConfidence >= 0 && minConfidence <= 1 ? minConfidence : DEFAULT_SETTINGS.minConfidence,
  }
}

/** Anything that can answer a decision request: the Workers AI binding in production, a fake in tests. */
export type ModelRunner = { run(model: string, input: DecisionRequest): Promise<unknown> }

class TimeoutError extends Error {}

// The model call is not cancelled when the time is up: its answer is simply ignored.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`no answer within ${ms} ms`)), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

// The error text comes from the AI service and could be anything, even a whole HTML error page.
// It is shown in the decision, so it is cut to one short line.
const ERROR_TEXT_MAX_LENGTH = 200

export function describeError(error: unknown): string {
  let text: string
  if (error instanceof Error) text = `${error.name}: ${error.message}`
  else if (typeof error === 'string') text = error
  else {
    try {
      text = JSON.stringify(error) ?? String(error)
    } catch {
      text = String(error)
    }
  }
  // Counted in characters (code points), so an emoji at the cut is never split in half.
  const characters = Array.from(text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim())
  return characters.length > ERROR_TEXT_MAX_LENGTH ? `${characters.slice(0, ERROR_TEXT_MAX_LENGTH).join('')}...` : characters.join('')
}

// ---------------------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------------------

/**
 * Routes one support request. Never throws and always returns a complete decision: from the
 * model when it answers in time with a valid result, otherwise from the keyword fallback.
 */
export async function routeSupportRequest(
  request: SupportRequest,
  runner: ModelRunner | null,
  settings: RouterSettings = DEFAULT_SETTINGS,
): Promise<RoutingDecision> {
  const startedAt = Date.now()
  const elapsed = () => Date.now() - startedAt

  if (!runner) {
    return fallbackDecision(request, 'model_unavailable', 'no decision model is configured (the AI binding is missing)', elapsed())
  }

  let raw: unknown
  try {
    raw = await withTimeout(runner.run(settings.model, buildDecisionRequest(request)), settings.timeoutMs)
  } catch (error) {
    if (error instanceof TimeoutError) return fallbackDecision(request, 'model_timeout', `the model gave ${error.message}`, elapsed())
    return fallbackDecision(request, 'model_error', `the model call failed: ${describeError(error)}`, elapsed())
  }

  const answers = parseModelAnswers(raw)
  if (!answers.ok) return fallbackDecision(request, 'invalid_model_output', `the model's answer was rejected: ${answers.problem}`, elapsed())
  return decideFromModel(answers.value, settings, elapsed())
}

// ---------------------------------------------------------------------------------------
// Output validation: the model's answer must fit the schema exactly
// ---------------------------------------------------------------------------------------

export type ModelAnswers = {
  reportedModel: string | null
  queue: Queue
  confidence: number
  queueProbabilities: Record<Queue, number>
  urgencyScore: number
  urgencyProbabilities: Record<Urgency, number>
  needsHumanProbability: number
  inputTokens: number | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isProbability = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
const isQueue = (value: unknown): value is Queue => typeof value === 'string' && (QUEUES as readonly string[]).includes(value)

/** Used by the ticket list filter. */
export const isQueueName = isQueue

type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string }

/** Every label must be present with a probability, and the probabilities must add up to about 1. */
function readProbabilities<L extends string>(value: unknown, labels: readonly L[], what: string): Parsed<Record<L, number>> {
  if (!isRecord(value)) return { ok: false, problem: `${what}.probabilities is missing` }
  const result = {} as Record<L, number>
  let sum = 0
  for (const label of labels) {
    const p = value[label]
    if (!isProbability(p)) return { ok: false, problem: `${what}.probabilities.${label} is not a probability` }
    result[label] = p
    sum += p
  }
  if (Math.abs(sum - 1) > 0.05) return { ok: false, problem: `${what}.probabilities add up to ${sum.toFixed(3)}, not 1` }
  return { ok: true, value: result }
}

// The score levels of the urgency question, in the order of URGENCIES.
const LEVELS = ['0', '1', '2'] as const

export function parseModelAnswers(raw: unknown): Parsed<ModelAnswers> {
  if (!isRecord(raw) || !isRecord(raw.answers)) return { ok: false, problem: 'the response has no "answers" object' }
  const { queue, urgency, needs_human: needsHuman } = raw.answers

  if (!isRecord(queue) || queue.type !== 'choice') return { ok: false, problem: 'answers.queue is not a choice answer' }
  const choice = queue.choice
  if (!isQueue(choice)) return { ok: false, problem: `answers.queue.choice "${String(choice)}" is not one of ${QUEUES.join(', ')}` }
  const queueProbabilities = readProbabilities(queue.probabilities, QUEUES, 'answers.queue')
  if (!queueProbabilities.ok) return queueProbabilities
  // An answer that contradicts itself (the chosen label is not the most probable one) is not trusted.
  const highest = Math.max(...QUEUES.map((label) => queueProbabilities.value[label]))
  if (queueProbabilities.value[choice] < highest - 1e-9) {
    return { ok: false, problem: `answers.queue.choice "${choice}" is not the most probable queue` }
  }
  const confidence = queue.confidence === undefined ? queueProbabilities.value[choice] : queue.confidence
  if (!isProbability(confidence)) return { ok: false, problem: 'answers.queue.confidence is not a probability' }

  if (!isRecord(urgency) || urgency.type !== 'score') return { ok: false, problem: 'answers.urgency is not a score answer' }
  const score = urgency.score
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > URGENCIES.length - 1) {
    return { ok: false, problem: `answers.urgency.score must be a number from 0 to ${URGENCIES.length - 1}` }
  }
  const levels = readProbabilities(urgency.probabilities, LEVELS, 'answers.urgency')
  if (!levels.ok) return levels

  if (!isRecord(needsHuman) || needsHuman.type !== 'noul' || !isProbability(needsHuman.noul)) {
    return { ok: false, problem: 'answers.needs_human is not a noul answer with a probability' }
  }

  const usage = isRecord(raw.usage) ? raw.usage : {}
  return {
    ok: true,
    value: {
      reportedModel: typeof raw.model === 'string' ? raw.model : null,
      queue: choice,
      confidence,
      queueProbabilities: queueProbabilities.value,
      urgencyScore: score,
      urgencyProbabilities: { low: levels.value['0'], normal: levels.value['1'], high: levels.value['2'] },
      needsHumanProbability: needsHuman.noul,
      inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : null,
    },
  }
}

// The policy on top of a valid model answer: the queue is the model's choice, the urgency is the
// most probable level, and a person is needed when the model says so or when it is not sure.
function decideFromModel(answers: ModelAnswers, settings: RouterSettings, latencyMs: number): RoutingDecision {
  const urgency = URGENCIES.reduce<Urgency>(
    (best, level) => (answers.urgencyProbabilities[level] > answers.urgencyProbabilities[best] ? level : best),
    'low',
  )
  const reasons: string[] = []
  if (answers.needsHumanProbability >= 0.5) {
    reasons.push(`the model judged that a person should read this message (probability ${answers.needsHumanProbability})`)
  }
  if (answers.confidence < settings.minConfidence) {
    reasons.push(`confidence ${answers.confidence} in the queue is below the threshold ${settings.minConfidence}`)
  }
  return {
    queue: answers.queue,
    urgency,
    needsHuman: reasons.length > 0,
    confidence: answers.confidence,
    source: 'model',
    model: settings.model,
    fallbackReason: null,
    details: {
      queueProbabilities: answers.queueProbabilities,
      urgencyScore: answers.urgencyScore,
      urgencyProbabilities: answers.urgencyProbabilities,
      needsHumanProbability: answers.needsHumanProbability,
      reasons,
      latencyMs,
      inputTokens: answers.inputTokens,
      reportedModel: answers.reportedModel,
    },
  }
}

// ---------------------------------------------------------------------------------------
// Deterministic fallback: keyword rules
// ---------------------------------------------------------------------------------------

// Deliberately simple and deliberately conservative: whatever the rules decide, a person is
// asked to look. Thai words are included because campus messages arrive in both languages.
// On a tie the first queue listed here wins. An access problem comes first because its keywords
// are specific (password, login), while the fault keywords include general phrases such as
// "doesn't work" that also appear in login complaints ("my password doesn't work"). A fault then
// beats a booking change. A message that matches nothing is a general question.
//
// A keyword is either text or a regular expression. The one regular expression is the Thai word
// เสีย ("broken"), which also begins many other words: เสียใจ (sorry), เสียดาย (pity), เสียเวลา
// (waste of time), เสียง (sound), เสียค่า… (pay a fee), เสียเงิน (cost money), เสียสิทธิ์ (lose a
// right), เสียบ (plug in), เสียโอกาส, เสียหน้า, เสียชีวิต, เสียสละ. Those continuations are excluded;
// เสียหาย (damaged) and a plain เสีย still count.
type Keyword = string | RegExp

const QUEUE_KEYWORDS: Record<Exclude<Queue, 'general_question'>, readonly Keyword[]> = {
  access_or_account: [
    'log in', 'login', 'log-in', 'sign in', 'password', 'account', 'student id', 'not authorised', 'not authorized',
    'unauthorised', 'unauthorized', 'permission', 'access denied', "can't access", 'cannot access', 'locked out',
    'เข้าสู่ระบบ', 'ล็อกอิน', 'รหัสผ่าน', 'บัญชี',
  ],
  equipment_fault: [
    'broken', 'not working', "doesn't work", 'does not work', "isn't working", 'not turning on', "won't turn on",
    'wont turn on', 'no power', 'damaged', 'missing', 'fault', 'faulty', 'blue screen', 'no sound', 'no signal',
    'flicker', 'flickers', 'flickering', 'dead', 'crash', 'crashed', 'crashes',
    /เสีย(?!ใจ|ดาย|เวลา|ง|ค่า|เงิน|สิทธิ|บ|โอกาส|หน้า|ชีวิต|สละ)/, 'พัง', 'เปิดไม่ติด', 'ใช้ไม่ได้', 'ชำรุด', 'ไม่ทำงาน',
    'ไม่มีเสียง', 'เสียงไม่ออก',
  ],
  booking_change: [
    'cancel', 'cancelled', 'canceled', 'cancelling', 'canceling', 'cancellation', 'reschedule', 'rescheduled',
    'rescheduling', 'move my booking', 'change the time', 'change my booking', 'change the booking', 'extend',
    'extended', 'shorten', 'shortened', 'double book', 'double-book', 'conflict', 'swap', 'postpone', 'postponed',
    'ยกเลิก', 'เลื่อน', 'เปลี่ยนเวลา', 'เปลี่ยนการจอง',
  ],
}

const HIGH_URGENCY_KEYWORDS: readonly Keyword[] = [
  'urgent', 'urgently', 'asap', 'right now', 'immediately', 'emergency', 'minute', 'minutes', 'within the hour',
  'today', 'tonight', 'this morning', 'this afternoon', 'ด่วน', 'ตอนนี้', 'วันนี้', 'บ่ายนี้', 'เช้านี้', 'เดี๋ยวนี้',
]

// Lower case, typographic apostrophes (’) as plain ones, and invisible zero-width characters removed,
// so "doesn’t work" written on a phone matches "doesn't work".
function normalise(message: string): string {
  return message
    .replace(/[​-‏⁠﻿]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
}

// Returns the text that matched, or null. A single Latin word must match as a whole word, so
// "dead" does not match inside "deadline"; phrases and Thai (which has no spaces between words)
// match anywhere in the text.
function findKeyword(text: string, keyword: Keyword): string | null {
  if (keyword instanceof RegExp) return keyword.exec(text)?.[0] ?? null
  const found = /^[a-z]+$/.test(keyword) ? new RegExp(`\\b${keyword}\\b`).test(text) : text.includes(keyword)
  return found ? keyword : null
}

const findAll = (text: string, keywords: readonly Keyword[]) =>
  keywords.map((keyword) => findKeyword(text, keyword)).filter((hit): hit is string => hit !== null)

/** The keyword rules on their own, so they can be tested and compared with the model. */
export function keywordRoute(message: string): { queue: Queue; urgency: Urgency; matched: string[] } {
  const text = normalise(message)
  let queue: Queue = 'general_question'
  let best = 0
  const matched: string[] = []
  for (const [candidate, keywords] of Object.entries(QUEUE_KEYWORDS) as [Queue, readonly Keyword[]][]) {
    const hits = findAll(text, keywords)
    matched.push(...hits.map((hit) => `${candidate} <- "${hit}"`))
    if (hits.length > best) {
      best = hits.length
      queue = candidate
    }
  }
  const urgent = findAll(text, HIGH_URGENCY_KEYWORDS)
  matched.push(...urgent.map((hit) => `high urgency <- "${hit}"`))
  const urgency: Urgency = urgent.length > 0 ? 'high' : queue === 'general_question' ? 'low' : 'normal'
  return { queue, urgency, matched }
}

function fallbackDecision(request: SupportRequest, reason: FallbackReason, detail: string, latencyMs: number): RoutingDecision {
  // The only server-side record of an outage. The message itself is never logged.
  console.warn(`support router: fallback decision (${reason}): ${detail}`)
  const rules = keywordRoute(request.message)
  return {
    queue: rules.queue,
    urgency: rules.urgency,
    needsHuman: true,
    confidence: 0,
    source: 'fallback',
    model: null,
    fallbackReason: reason,
    details: {
      queueProbabilities: { booking_change: 0, equipment_fault: 0, access_or_account: 0, general_question: 0 },
      urgencyScore: URGENCIES.indexOf(rules.urgency),
      urgencyProbabilities: { low: 0, normal: 0, high: 0 },
      needsHumanProbability: 1,
      reasons: [
        detail,
        rules.matched.length > 0 ? `keyword rules matched: ${rules.matched.join('; ')}` : 'no keyword matched, so the message goes to general_question',
        'a fallback decision is always checked by a person',
      ],
      latencyMs,
      inputTokens: null,
      reportedModel: null,
    },
  }
}

// ---------------------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------------------

const MESSAGE_MAX_LENGTH = 2000
const ID_MAX_LENGTH = 64

// Control characters other than tab, line feed and carriage return (NUL has its own message).
const CONTROL_CHARACTER = /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/
// Half of a UTF-16 surrogate pair without the other half: not valid Unicode text.
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

function textProblem(name: string, value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.trim() === '') return `${name} must be a non-empty string`
  if (value.includes('\u0000')) return `${name} must not contain NUL characters`
  if (CONTROL_CHARACTER.test(value)) return `${name} must not contain control characters (tabs and line breaks are allowed)`
  if (LONE_SURROGATE.test(value)) return `${name} must be valid Unicode text`
  if (value.trim().length > maxLength) return `${name} must be at most ${maxLength} characters`
  return null
}

/** message is required; context.equipmentId and context.bookingId are optional. Anything else in the body is ignored. */
export function validateSupportRequest(body: unknown): Validated<SupportRequest> {
  if (!isRecord(body)) return { ok: false, errors: ['Request body must be a valid JSON object'] }
  const errors: string[] = []

  if (body.message === undefined) errors.push('message is required')
  else {
    const problem = textProblem('message', body.message, MESSAGE_MAX_LENGTH)
    if (problem) errors.push(problem)
  }

  const context: NonNullable<SupportRequest['context']> = {}
  if (body.context !== undefined) {
    if (!isRecord(body.context)) errors.push('context must be an object')
    else {
      for (const name of ['equipmentId', 'bookingId'] as const) {
        const value = body.context[name]
        if (value === undefined) continue
        const problem = textProblem(`context.${name}`, value, ID_MAX_LENGTH)
        if (problem) errors.push(problem)
        else context[name] = (value as string).trim()
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  const request: SupportRequest = { message: (body.message as string).trim() }
  if (Object.keys(context).length > 0) request.context = context
  return { ok: true, value: request }
}
