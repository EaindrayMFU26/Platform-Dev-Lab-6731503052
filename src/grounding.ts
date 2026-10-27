// Grounding context for the decision model (assignment A7, the one improvement).
//
// The service's support guidelines are a small local knowledge base (knowledge-base.json). For
// each message, selectGuidelines() picks the records that are relevant to it, and the router puts
// them into the state it sends to the model, so the model can decide by the platform's own rules
// instead of guessing them. The setting ROUTER_GROUNDING ("on" or "off", default "off") switches
// this on; with it off, the request is exactly the one of A6.
//
// Selection is deterministic keyword retrieval, no vector database:
//   1. Records marked "always" (the urgency levels and the rule for when a person must read the
//      message) apply to every message and are always included.
//   2. Every other record gets a score: the number of its keywords found in the message (and in
//      the equipment id from the context, if any), matched like the fallback's keywords.
//   3. The MAX_RETRIEVED records with the highest score (at least 1) are added; a tie goes to the
//      record listed first.
// The selected records are sent in knowledge-base order, with id, title and text only.

import knowledge from './knowledge-base.json' with { type: 'json' }
import { findAll, normalise } from './text-match.ts'

export type KnowledgeRecord = { id: string; title: string; always?: boolean; keywords: string[]; text: string }

/** One record as the model sees it in the state. */
export type Guideline = { id: string; title: string; text: string }

export const KNOWLEDGE_BASE: readonly KnowledgeRecord[] = knowledge.records as KnowledgeRecord[]
export const MAX_RETRIEVED = 3

export type Retrieval = {
  guidelines: Guideline[]
  /** Why each topic record was or was not chosen: its keyword hits, for evidence and tests. */
  scores: { id: string; hits: string[] }[]
}

export function selectGuidelines(message: string, equipmentId?: string): Retrieval {
  const text = normalise(equipmentId ? `${message} ${equipmentId}` : message)
  const scores = KNOWLEDGE_BASE.filter((record) => !record.always).map((record) => ({
    id: record.id,
    hits: findAll(text, record.keywords),
  }))
  const retrieved = new Set(
    scores
      .filter((s) => s.hits.length > 0)
      .map((s, order) => ({ ...s, order }))
      .sort((a, b) => b.hits.length - a.hits.length || a.order - b.order)
      .slice(0, MAX_RETRIEVED)
      .map((s) => s.id),
  )
  const guidelines = KNOWLEDGE_BASE.filter((record) => record.always || retrieved.has(record.id)).map(({ id, title, text }) => ({
    id,
    title,
    text,
  }))
  return { guidelines, scores }
}
