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

// ── Auto-generated narrative text ─────────────────────────────────────────
// All of this is derived purely from New Wave's own data (no external
// inputs), matching the template's "insight"-style prose without needing a
// human to write it each month.

export function fmtRpShort(n: number): string {
  return 'Rp' + Math.round(n).toLocaleString('id-ID')
}
function hostNameOf(r: ReportRow): string {
  return r.profiles?.full_name || 'Host'
}
function dateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `${d} ${months[m - 1]}`
}

export interface DailyHighlight {
  id: string; tag: string; dateStr: string; dateLabel: string; startTime: string
  host: string; gmv: number; trans: number; viewer: number
}
// Best Session + up to one Twindate + one Payday callout card, matching the
// template's "Daily Evaluation" highlight boxes. Picks the highest-GMV
// session for each tag when more than one date qualifies in the period.
export function generateDailyHighlights(reports: ReportRow[], tags: Map<string, SessionTag[]>): DailyHighlight[] {
  const byTag: Record<string, ReportRow> = {}
  reports.forEach(r => {
    const list = tags.get(r.id)
    if (!list) return
    list.forEach(tag => {
      if (!tag) return
      if (!byTag[tag] || (r.gmv || 0) > (byTag[tag].gmv || 0)) byTag[tag] = r
    })
  })
  const order: SessionTag[] = ['Best Session', 'Twindate', 'Payday']
  return order.filter(t => t && byTag[t]).map(tag => {
    const r = byTag[tag as string]
    return {
      id: r.id, tag: tag as string, dateStr: r.report_date, dateLabel: dateLabel(r.report_date),
      startTime: r.start_time?.slice(0, 5) || '-', host: hostNameOf(r),
      gmv: r.gmv || 0, trans: r.trans || 0, viewer: r.viewer || 0,
    }
  })
}

// 2-3 bullet points summarizing the period: best session's share of total
// GMV, a Twindate-vs-Payday comparison (only if both occurred), and a host
// consistency note (volume leader vs most-efficient-per-session host).
export function generateKeyFindings(
  reports: ReportRow[], tags: Map<string, SessionTag[]>,
  hostEval: { name: string; sessions: number; totalGmv: number; avgGmv: number }[],
  totalGmv: number, monthLabel: string,
): string[] {
  const findings: string[] = []
  const highlights = generateDailyHighlights(reports, tags)
  const best = highlights.find(h => h.tag === 'Best Session')
  if (best && totalGmv > 0) {
    const pct = (best.gmv / totalGmv) * 100
    findings.push(
      `Best session: ${best.dateLabel} (Host ${best.host}, ${best.startTime}), GMV ${fmtRpShort(best.gmv)} dengan ${best.trans} transaksi — ` +
      `sesi terbesar sepanjang ${monthLabel}, menyumbang ${pct.toFixed(1)}% dari total GMV bulan ini.`
    )
  }
  const twindate = highlights.find(h => h.tag === 'Twindate')
  const payday = highlights.find(h => h.tag === 'Payday')
  if (twindate && payday) {
    const bigger = twindate.gmv >= payday.gmv ? 'Twindate' : 'Payday'
    findings.push(
      `Twindate (${twindate.dateLabel}, ${twindate.host}): GMV ${fmtRpShort(twindate.gmv)} vs Payday (${payday.dateLabel}, ${payday.host}): GMV ${fmtRpShort(payday.gmv)} — ` +
      `${bigger} lebih efektif mendorong GMV bulan ini.`
    )
  }
  if (hostEval.length >= 2) {
    const byAvg = [...hostEval].sort((a, b) => b.avgGmv - a.avgGmv)[0]
    const byTotal = hostEval[0] // already sorted by total GMV desc by the caller
    if (byAvg.name !== byTotal.name) {
      findings.push(
        `${byAvg.name} membukukan avg GMV/sesi tertinggi (${fmtRpShort(byAvg.avgGmv)}) dari ${byAvg.sessions} sesi. ` +
        `${byTotal.name} memimpin total GMV (${fmtRpShort(byTotal.totalGmv)}) dari ${byTotal.sessions} sesi.`
      )
    } else {
      findings.push(`${byTotal.name} memimpin baik dari total GMV (${fmtRpShort(byTotal.totalGmv)}) maupun avg GMV/sesi (${fmtRpShort(byTotal.avgGmv)}) dari ${byTotal.sessions} sesi.`)
    }
  }
  return findings
}

export function generateSessionTimeInsight(slots: SessionTimeSlot[]): string {
  if (!slots.length) return ''
  const mostSessions = slots.find(s => s.isMostSessions)
  const topCvr = slots.find(s => s.isTopCvr)
  const byGmv = [...slots].sort((a, b) => b.gmv - a.gmv)[0]
  let text = `Slot ${mostSessions?.startTime} mendominasi frekuensi (${mostSessions?.sessions} sesi) `
  text += `dengan total GMV ${fmtRpShort(mostSessions?.gmv || 0)}. `
  if (topCvr && topCvr.startTime !== mostSessions?.startTime) {
    text += `Slot ${topCvr.startTime} mencatat CVR tertinggi (${topCvr.cvr.toFixed(2)}%). `
  }
  if (byGmv.startTime !== mostSessions?.startTime) {
    text += `Slot ${byGmv.startTime} menghasilkan GMV tertinggi (${fmtRpShort(byGmv.gmv)}) meski bukan yang paling sering dijadwalkan.`
  }
  return text.trim()
}

export function generateHostInsight(hostEval: { name: string; sessions: number; totalGmv: number; avgGmv: number; cvr: number }[]): string {
  if (!hostEval.length) return ''
  const top = hostEval[0]
  const lowCvr = [...hostEval].filter(h => h.sessions >= 2).sort((a, b) => a.cvr - b.cvr)[0]
  let text = `${top.name} memimpin total GMV (${fmtRpShort(top.totalGmv)}) dari ${top.sessions} sesi, CVR ${top.cvr.toFixed(2)}%. `
  if (lowCvr && lowCvr.name !== top.name && lowCvr.cvr < 0.1) {
    text += `${lowCvr.name} menjalankan ${lowCvr.sessions} sesi dengan CVR ${lowCvr.cvr.toFixed(2)}% — perlu evaluasi strategi konten & produk.`
  }
  return text.trim()
}

export function generateProductInsight(products: { name: string; itemSold: number; total: number }[], totalGmv: number): string {
  if (!products.length) return ''
  const top = products[0]
  const pct = totalGmv > 0 ? (top.total / totalGmv) * 100 : 0
  return `${top.name} adalah produk terlaris, menyumbang ${fmtRpShort(top.total)} (${pct.toFixed(1)}% dari total GMV) dari ${top.itemSold} item terjual.`
}

export function generateMoMInsight(metrics: MoMMetric[]): string {
  const gmv = metrics.find(m => m.label === 'GMV')
  if (!gmv || gmv.pctChange === null) return ''
  const up = metrics.filter(m => (m.pctChange ?? 0) >= 0).length
  const down = metrics.length - up
  const direction = gmv.pctChange >= 0 ? 'naik' : 'turun'
  return `GMV ${direction} ${Math.abs(gmv.pctChange).toFixed(1)}% dibanding bulan lalu. ` +
    `${up} dari ${metrics.length} metrik utama naik${down > 0 ? `, ${down} turun` : ''}.`
}

// ── 2-month cumulative aggregations (current + previous month combined) ────
// Matches the template's "Session Time Evaluation — 2 Bulan" / "Host
// Evaluation — 2 Bulan" slides. We already fetch the previous month's rows
// for the MoM comparison, so these are derivable with no extra queries.

export interface SessionTimeSlot2Month {
  startTime: string
  prevSessions: number; prevGmv: number
  curSessions: number; curGmv: number
  totalSessions: number; totalGmv: number; avgGmv: number
  viewer: number; trans: number; comment: number; cvr: number
  isMostSessions: boolean; isTopCvr: boolean
  isCurOnly: boolean; isPrevOnly: boolean
}
export function computeSessionTimeEval2Month(current: ReportRow[], previous: ReportRow[]): SessionTimeSlot2Month[] {
  const map: Record<string, { prevSessions: number; prevGmv: number; curSessions: number; curGmv: number; viewer: number; trans: number; comment: number }> = {}
  const addTo = (r: ReportRow, isCur: boolean) => {
    const hour = r.start_time ? r.start_time.slice(0, 5) : '—'
    if (!map[hour]) map[hour] = { prevSessions: 0, prevGmv: 0, curSessions: 0, curGmv: 0, viewer: 0, trans: 0, comment: 0 }
    if (isCur) { map[hour].curSessions += 1; map[hour].curGmv += r.gmv || 0 }
    else { map[hour].prevSessions += 1; map[hour].prevGmv += r.gmv || 0 }
    map[hour].viewer += r.viewer || 0
    map[hour].trans += r.trans || 0
    map[hour].comment += r.comment_count || 0
  }
  previous.forEach(r => addTo(r, false))
  current.forEach(r => addTo(r, true))
  const slots = Object.entries(map).map(([startTime, d]) => {
    const totalSessions = d.prevSessions + d.curSessions
    const totalGmv = d.prevGmv + d.curGmv
    return {
      startTime, ...d, totalSessions, totalGmv,
      avgGmv: totalSessions ? totalGmv / totalSessions : 0,
      cvr: d.viewer ? (d.trans / d.viewer) * 100 : 0,
      isMostSessions: false, isTopCvr: false,
      isCurOnly: d.prevSessions === 0 && d.curSessions > 0,
      isPrevOnly: d.curSessions === 0 && d.prevSessions > 0,
    }
  })
  if (slots.length) {
    const maxSessions = Math.max(...slots.map(s => s.totalSessions))
    const maxCvr = Math.max(...slots.map(s => s.cvr))
    slots.forEach(s => {
      s.isMostSessions = s.totalSessions === maxSessions
      s.isTopCvr = s.cvr === maxCvr && s.cvr > 0
    })
  }
  return slots.sort((a, b) => b.totalGmv - a.totalGmv)
}

export interface HostEval2Month {
  name: string
  prevSessions: number; prevGmv: number
  curSessions: number; curGmv: number
  totalSessions: number; totalGmv: number; avgGmv: number
  viewer: number; trans: number; comment: number; cvr: number
  isCurOnly: boolean; isPrevOnly: boolean
}
export function computeHostEval2Month(current: ReportRow[], previous: ReportRow[]): HostEval2Month[] {
  const map: Record<string, HostEval2Month> = {}
  const addTo = (r: ReportRow, isCur: boolean) => {
    const name = r.profiles?.full_name || 'Tanpa Host'
    const key = r.host_id || name
    if (!map[key]) map[key] = {
      name, prevSessions: 0, prevGmv: 0, curSessions: 0, curGmv: 0,
      totalSessions: 0, totalGmv: 0, avgGmv: 0, viewer: 0, trans: 0, comment: 0, cvr: 0,
      isCurOnly: false, isPrevOnly: false,
    }
    if (isCur) { map[key].curSessions += 1; map[key].curGmv += r.gmv || 0 }
    else { map[key].prevSessions += 1; map[key].prevGmv += r.gmv || 0 }
    map[key].viewer += r.viewer || 0
    map[key].trans += r.trans || 0
    map[key].comment += r.comment_count || 0
  }
  previous.forEach(r => addTo(r, false))
  current.forEach(r => addTo(r, true))
  return Object.values(map).map(h => {
    h.totalSessions = h.prevSessions + h.curSessions
    h.totalGmv = h.prevGmv + h.curGmv
    h.avgGmv = h.totalSessions ? h.totalGmv / h.totalSessions : 0
    h.cvr = h.viewer ? (h.trans / h.viewer) * 100 : 0
    h.isCurOnly = h.prevSessions === 0 && h.curSessions > 0
    h.isPrevOnly = h.curSessions === 0 && h.prevSessions > 0
    return h
  }).sort((a, b) => b.totalGmv - a.totalGmv)
}

export function generateSessionTime2MonthInsight(slots: SessionTimeSlot2Month[], curLabel: string, prevLabel: string): string {
  if (!slots.length) return ''
  const topByTotal = slots[0]
  const topCvr = [...slots].sort((a, b) => b.cvr - a.cvr)[0]
  let text = `Slot ${topByTotal.startTime} mencatat total GMV tertinggi (${fmtRpShort(topByTotal.totalGmv)}) dari ${topByTotal.totalSessions} sesi gabungan ${prevLabel} & ${curLabel}. `
  const newSlot = slots.find(s => s.isCurOnly)
  if (newSlot) text += `Slot ${newSlot.startTime} baru muncul di ${curLabel} (${newSlot.curSessions} sesi, ${fmtRpShort(newSlot.curGmv)}) — tidak ada di ${prevLabel}. `
  if (topCvr && topCvr.cvr > 0) text += `Slot ${topCvr.startTime} mencatat CVR tertinggi (${topCvr.cvr.toFixed(2)}%).`
  return text.trim()
}

export function generateHostEval2MonthInsight(hosts: HostEval2Month[], curLabel: string, prevLabel: string): string {
  if (!hosts.length) return ''
  const top = hosts[0]
  const byAvg = [...hosts].filter(h => h.totalSessions >= 2).sort((a, b) => b.avgGmv - a.avgGmv)[0]
  let text = `${top.name} memimpin total GMV kumulatif (${fmtRpShort(top.totalGmv)}) dari ${top.totalSessions} sesi (${prevLabel} + ${curLabel}). `
  if (byAvg && byAvg.name !== top.name) text += `${byAvg.name} paling efisien dengan avg GMV/sesi ${fmtRpShort(byAvg.avgGmv)}. `
  const dropped = hosts.find(h => h.isPrevOnly)
  if (dropped) text += `${dropped.name} aktif di ${prevLabel} namun tidak tercatat di ${curLabel}.`
  return text.trim()
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
