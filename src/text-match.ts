// Keyword matching shared by the keyword fallback (support-router.ts) and the retrieval of
// grounding context (grounding.ts). Moved here unchanged from support-router.ts for A7.

/** A keyword is either text or a regular expression. */
export type Keyword = string | RegExp

// Lower case, typographic apostrophes (’) as plain ones, and invisible zero-width characters removed,
// so "doesn’t work" written on a phone matches "doesn't work".
export function normalise(message: string): string {
  return message
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .toLowerCase()
}

// Returns the text that matched, or null. A single Latin word must match as a whole word, so
// "dead" does not match inside "deadline"; phrases and Thai (which has no spaces between words)
// match anywhere in the text.
export function findKeyword(text: string, keyword: Keyword): string | null {
  if (keyword instanceof RegExp) return keyword.exec(text)?.[0] ?? null
  const found = /^[a-z]+$/.test(keyword) ? new RegExp(`\\b${keyword}\\b`).test(text) : text.includes(keyword)
  return found ? keyword : null
}

/** Every keyword of the list that occurs in the (already normalised) text, in list order. */
export const findAll = (text: string, keywords: readonly Keyword[]) =>
  keywords.map((keyword) => findKeyword(text, keyword)).filter((hit): hit is string => hit !== null)
