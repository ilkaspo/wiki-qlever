// Step 4 and 5 of the pipeline: keep the reviewer's decisions and export the accepted statements.
// Nothing is written to Commons from here. The reviewer pastes the export into QuickStatements.

import type { HeadingHint } from './titleParse'

export type AcceptedValue = {
  qid: string
  label: string
  /** Search term that produced the candidate, or "manual" for an ID typed by the reviewer. */
  term: string
  source: string
  score: number | null
  reasons: string[]
}

export type Decision = {
  pageId: number
  title: string
  accepted: AcceptedValue[]
  /** The reviewer looked at the file and found no fitting candidate. */
  rejected: boolean
  heading: HeadingHint | null
  decidedAt: string
}

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

const STORAGE_KEY = 'wiki-qlever.depicts-review.v1'

export function createDecisionStore(storage: KeyValueStore | null, now: () => Date = () => new Date()) {
  const decisions = new Map<number, Decision>()
  const subscribers = new Set<() => void>()

  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]') as Decision[]
    for (const d of saved) if (typeof d.pageId === 'number' && Array.isArray(d.accepted)) decisions.set(d.pageId, d)
  } catch {
    // Unreadable or blocked storage: start empty.
  }

  function changed() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify([...decisions.values()]))
    } catch {
      // Storage full or blocked: the decisions stay in memory for this visit.
    }
    subscribers.forEach((fn) => fn())
  }

  function entry(file: { pageId: number; title: string }, heading: HeadingHint | null): Decision {
    let decision = decisions.get(file.pageId)
    if (!decision) {
      decision = { ...file, accepted: [], rejected: false, heading, decidedAt: '' }
      decisions.set(file.pageId, decision)
    }
    decision.decidedAt = now().toISOString()
    return decision
  }

  return {
    get: (pageId: number): Decision | undefined => decisions.get(pageId),
    all: (): Decision[] => [...decisions.values()],
    accept(file: { pageId: number; title: string }, heading: HeadingHint | null, value: AcceptedValue) {
      const decision = entry(file, heading)
      decision.rejected = false
      if (!decision.accepted.some((a) => a.qid === value.qid)) decision.accepted.push(value)
      changed()
    },
    withdraw(pageId: number, qid: string) {
      const decision = decisions.get(pageId)
      if (!decision) return
      decision.accepted = decision.accepted.filter((a) => a.qid !== qid)
      if (decision.accepted.length === 0 && !decision.rejected) decisions.delete(pageId)
      changed()
    },
    setRejected(file: { pageId: number; title: string }, heading: HeadingHint | null, rejected: boolean) {
      const decision = entry(file, heading)
      decision.rejected = rejected
      if (rejected) decision.accepted = []
      else if (decision.accepted.length === 0) decisions.delete(file.pageId)
      changed()
    },
    clear() {
      decisions.clear()
      changed()
    },
    subscribe(fn: () => void): () => void {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },
  }
}

export type DecisionStore = ReturnType<typeof createDecisionStore>

export function summarize(decisions: Decision[]): { files: number; statements: number; rejected: number } {
  const withValues = decisions.filter((d) => d.accepted.length > 0)
  return {
    files: withValues.length,
    statements: withValues.reduce((n, d) => n + d.accepted.length, 0),
    rejected: decisions.filter((d) => d.rejected).length,
  }
}

/** QuickStatements V1 commands for Commons: one "M<page id>|P180|Q<item>" line per accepted value. */
export function toQuickStatements(decisions: Decision[]): string {
  return decisions
    .flatMap((d) => d.accepted.map((a) => `M${d.pageId}|P180|${a.qid}`))
    .join('\n')
}

/** The full record: what was suggested from where, what the reviewer chose, and the heading hints. */
export function toReviewLog(decisions: Decision[], collection: string): string {
  return JSON.stringify(
    {
      tool: 'wiki-qlever depicts review',
      property: 'P180',
      collection,
      note: 'Heading hints are read from file names and are not part of the QuickStatements export.',
      decisions,
    },
    null,
    2,
  )
}
