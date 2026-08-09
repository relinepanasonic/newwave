// Pure calculation helpers for the Client Report page. Kept separate from
// ClientReportClient.tsx so Phase 2/3 (on-screen sections, PDF/PPT export)
// can all share the exact same numbers without recomputing them differently.

export interface ReportRow {
  id: string; report_date: string; brand: string | null; platform: string | null
  start_time: string | null; duration_hours: number | null
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  product_sold_name: string | null; notes: string | null
  host_id: string | null; profiles: { full_name: string } | null
}

// "Twindate" campaign days (2 Feb, 3 Mar, 4 Apr, ... 12 Dec — day-of-month
// equals the month number) and "Payday" (25th of every month) are the two
// recurring e-commerce sales-spike days New Wave tracks. Both are derivable
// purely from the date, no manual tagging needed.
export type SessionTag = 'Best Session' | 'Twindate' | 'Payday' | null

export function detectDateTag(dateStr: string): 'Twindate' | 'Payday' | null {
  const [, m, d] = dateStr.split('-').map(Number)
  if (d === 25) return 'Payday'
  if (d === m) return 'Twindate'
  return null
}

// Tags every report: date-based tag (Twindate/Payday) takes precedence in
// the label since it's the more specific/rarer callout; the single highest-
// GMV report in the set additionally gets "Best Session" noted alongside it
// if it doesn't already have a date tag.
export function tagSessions(reports: ReportRow[]): Map<string, SessionTag[]> {
  const tags = new Map<string, SessionTag[]>()
  let bestId: string | null = null
  let bestGmv = -1
  reports.forEach(r => {
    const list: SessionTag[] = []
    const dateTag = detectDateTag(r.report_date)
    if (dateTag) list.push(dateTag)
    if (list.length) tags.set(r.id, list)
    if ((r.gmv || 0) > bestGmv) { bestGmv = r.gmv || 0; bestId = r.id }
  })
  if (bestId && bestGmv > 0) {
    const existing = tags.get(bestId) || []
    tags.set(bestId, ['Best Session', ...existing])
  }
  return tags
}

export interface SessionTimeSlot {
  startTime: string; sessions: number; gmv: number; viewer: number; trans: number; comment: number
  cvr: number; isMostSessions: boolean; isTopCvr: boolean
}

// Groups reports by their Start Live hour (HH:00) to show which time slots
// perform best — matches the template's "Session Time Evaluation" table.
export function computeSessionTimeEval(reports: ReportRow[]): SessionTimeSlot[] {
  const map: Record<string, { sessions: number; gmv: number; viewer: number; trans: number; comment: number }> = {}
  reports.forEach(r => {
    const hour = r.start_time ? r.start_time.slice(0, 5) : '—'
    if (!map[hour]) map[hour] = { sessions: 0, gmv: 0, viewer: 0, trans: 0, comment: 0 }
    map[hour].sessions += 1
    map[hour].gmv += r.gmv || 0
    map[hour].viewer += r.viewer || 0
    map[hour].trans += r.trans || 0
    map[hour].comment += r.comment_count || 0
  })
  const slots = Object.entries(map).map(([startTime, d]) => ({
    startTime, ...d, cvr: d.viewer ? (d.trans / d.viewer) * 100 : 0,
    isMostSessions: false, isTopCvr: false,
  }))
  if (slots.length) {
    const maxSessions = Math.max(...slots.map(s => s.sessions))
    const maxCvr = Math.max(...slots.map(s => s.cvr))
    slots.forEach(s => {
      s.isMostSessions = s.sessions === maxSessions
      s.isTopCvr = s.cvr === maxCvr && s.cvr > 0
    })
  }
  return slots.sort((a, b) => b.gmv - a.gmv)
}

export interface PeriodTotals {
  gmv: number; sessions: number; trans: number; viewer: number; comment: number
}
export function totalsOf(reports: ReportRow[]): PeriodTotals {
  return reports.reduce((acc, r) => ({
    gmv: acc.gmv + (r.gmv || 0),
    sessions: acc.sessions + 1,
    trans: acc.trans + (r.trans || 0),
    viewer: acc.viewer + (r.viewer || 0),
    comment: acc.comment + (r.comment_count || 0),
  }), { gmv: 0, sessions: 0, trans: 0, viewer: 0, comment: 0 })
}

export interface MoMMetric { label: string; current: number; previous: number; pctChange: number | null }
// null pctChange = previous period had 0 (no meaningful % to show, avoid div/0 -> Infinity).
export function computeMoM(current: PeriodTotals, previous: PeriodTotals): MoMMetric[] {
  const pct = (c: number, p: number) => p === 0 ? null : ((c - p) / p) * 100
  return [
    { label: 'GMV', current: current.gmv, previous: previous.gmv, pctChange: pct(current.gmv, previous.gmv) },
    { label: 'Sesi', current: current.sessions, previous: previous.sessions, pctChange: pct(current.sessions, previous.sessions) },
    { label: 'Transaksi', current: current.trans, previous: previous.trans, pctChange: pct(current.trans, previous.trans) },
    { label: 'Viewers', current: current.viewer, previous: previous.viewer, pctChange: pct(current.viewer, previous.viewer) },
    { label: 'Comments', current: current.comment, previous: previous.comment, pctChange: pct(current.comment, previous.comment) },
  ]
}

// "#1 GMV", "#2 GMV", ... rank labels for the Host Evaluation table,
// matching the template. Input must already be sorted by total GMV desc.
export function rankLabel(index: number): string {
  return `#${index + 1} GMV`
}

// Splits a mixed-platform report set into per-platform totals, for the
// "Both" download mode's Shopee vs TikTok comparison page.
export function splitByPlatform(reports: ReportRow[], platforms: string[]): Record<string, PeriodTotals & { reports: ReportRow[] }> {
  const out: Record<string, PeriodTotals & { reports: ReportRow[] }> = {}
  platforms.forEach(p => { out[p] = { ...totalsOf([]), reports: [] } })
  reports.forEach(r => {
    const p = r.platform || 'Other'
    if (!out[p]) out[p] = { ...totalsOf([]), reports: [] }
    out[p].reports.push(r)
  })
  Object.keys(out).forEach(p => {
    const t = totalsOf(out[p].reports)
    out[p].gmv = t.gmv; out[p].sessions = t.sessions; out[p].trans = t.trans
    out[p].viewer = t.viewer; out[p].comment = t.comment
  })
  return out
}
