'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, PLATFORM_COLORS } from '@/lib/utils'
import {
  Upload, AlertTriangle, CheckCircle2, XCircle, Link2, X, CalendarSearch, ExternalLink,
  Pencil, FileSpreadsheet, Save, Sparkles, CalendarPlus, RefreshCw,
} from 'lucide-react'
import CurrencyInput from '@/components/CurrencyInput'
import TimeInput from '@/components/TimeInput'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'

const PLATFORMS = ['TikTok', 'Shopee', 'Instagram', 'YouTube', 'Other']

const MONTH_ID: Record<string, number> = {
  jan:1,feb:2,mar:3,apr:4,may:5,mei:5,jun:6,jul:7,aug:8,agu:8,sep:9,oct:10,okt:10,nov:11,dec:12,des:12,
}

// Parse many date formats → YYYY-MM-DD. Supports: YYYY-MM-DD | DD/MM/YYYY | 21-Jun-2026
function parseDate(s: string): string {
  s = s.trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/').map(Number)
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }
  const m3 = s.match(/^(\d{1,2})[-\s]([a-zA-Z]{3,})[-\s](\d{4})$/)
  if (m3) {
    const mo = MONTH_ID[m3[2].toLowerCase().slice(0,3)]
    if (mo) return `${m3[3]}-${String(mo).padStart(2,'0')}-${String(m3[1]).padStart(2,'0')}`
  }
  return ''
}

// "13.00" or "13:00" → "13:00"
function parseTime(s: string): string {
  s = s.trim()
  if (!s) return ''
  const m = s.match(/^(\d{1,2})[.:](\d{2})$/)
  if (m) return `${String(m[1]).padStart(2,'0')}:${m[2]}`
  return s
}

function parseRp(s: string): number {
  if (!s || !s.trim()) return 0
  const clean = s.replace(/Rp/gi,'').replace(/\./g,'').replace(/,/g,'').replace(/\s/g,'')
  return parseInt(clean, 10) || 0
}

function parseNum(s: string): number {
  if (!s || !s.trim()) return 0
  const clean = s.replace(/\./g,'').replace(/,/g,'').trim()
  return parseInt(clean, 10) || 0
}

function normalizePlatform(s: string): string {
  const map: Record<string,string> = { tiktok:'TikTok', shopee:'Shopee', instagram:'Instagram', youtube:'YouTube', other:'Other' }
  return map[s.toLowerCase().trim()] || s.trim()
}

function normBrand(s: string) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '') }
function brandsMatch(a: string, b: string) {
  const na = normBrand(a), nb = normBrand(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const splitLine = (l: string) => l.split(',').map(c => c.trim().replace(/^"|"$/g,''))
  return { headers: splitLine(lines[0]), rows: lines.slice(1).map(splitLine) }
}

function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtNum(n: number) { return n.toLocaleString('id-ID') }
function fmtFixedDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
    + ' ' + new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
// Picker labels are Tanggal · Jam · Host · Brand -- the date is always shown
// (not just when it differs from the CSV row's own date) so an admin matching
// a midnight-crossing session can actually confirm which day they're picking
// instead of trusting the day-before/after inference.
function shortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}
// Schedule slots without a manually-set jam_mulai default to their session
// number's hour (session 1 = 00:00, session 18 = 17:00, etc.) — same
// fallback the Schedule page itself uses.
function slotTime(s: { jam_mulai: string | null; session_no: number }): string {
  return s.jam_mulai ? s.jam_mulai.slice(0, 5) : `${String(s.session_no - 1).padStart(2, '0')}:00`
}

interface CsvRow {
  _line: number
  tanggal: string; brand: string; room: string; startSesi: string; totalJam: number
  host: string; platform: string
  gmv: number; impression: number; viewer: number; trans: number; comment: number
}

interface AppReport {
  id: string; report_date: string; host_id: string; brand: string | null; platform: string | null
  start_time: string | null; duration_hours: number | null
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  screenshot_url: string | null
  notes: string | null
  slot_id: string | null
  profiles: { full_name: string; username: string | null } | null
}

interface ScheduleSlotRow {
  id: string; slot_date: string; session_no: number; jam_mulai: string | null; durasi: number | null
  brand: string | null; platform: string | null; host_id: string
}

type Metric = 'gmv' | 'impression' | 'viewer' | 'trans' | 'comment'

interface CompareRow {
  csv: CsvRow
  csvIdx: number
  app: AppReport | null
  mismatches: Set<Metric>
  status: 'match' | 'mismatch' | 'missing_in_app' | 'not_reported_confirmed'
  isManual: boolean
  notReportedSlot: ScheduleSlotRow | null
  // Admin decided the app's numbers are right and the CSV is wrong, so the
  // row is settled even though the two still differ.
  acceptedApp: boolean
}

function MetricCell({ csvVal, appVal, mismatch, fmt }: { csvVal: number; appVal?: number; mismatch: boolean; fmt: (n: number) => string }) {
  if (!mismatch) return <td className="px-1.5 py-1.5 text-right text-gray-700 whitespace-nowrap text-[11px]">{fmt(csvVal)}</td>
  return (
    <td className="px-1.5 py-1.5 text-right whitespace-nowrap bg-pink-50 text-[11px]">
      <div className="text-pink-700 font-bold">{fmt(csvVal)}</div>
      <div className="text-[9px] text-pink-400">App: {appVal !== undefined ? fmt(appVal) : '—'}</div>
    </td>
  )
}

export default function RekonsiliasiTab({ profile: _profile, refreshSignal }: { profile: any; refreshSignal?: number }) {
  const { lang } = useLang()
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [appReports, setAppReports] = useState<AppReport[]>([])
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotRow[]>([])
  const [hosts, setHosts] = useState<{ id: string; full_name: string; username: string | null }[]>([])
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'mismatch' | 'missing_in_app' | 'not_reported_confirmed'>('all')
  // Session-only manual matches: csv row index -> app report id / schedule slot id. Resets on new upload.
  const [manualMatches, setManualMatches] = useState<Record<number, string>>({})
  const [notReportedMatches, setNotReportedMatches] = useState<Record<number, string>>({})
  const [notReportedReportIds, setNotReportedReportIds] = useState<Record<number, string>>({})
  const [savingNotReportedIdx, setSavingNotReportedIdx] = useState<number | null>(null)
  const [notReportedError, setNotReportedError] = useState('')
  // Schedule slots this tab created via "Buat Jadwal": csv row index -> slot id.
  // Tracked so Batalkan can remove the slot it created, not just the report.
  const [createdSlotIds, setCreatedSlotIds] = useState<Record<number, string>>({})
  const [pickingIdx, setPickingIdx] = useState<number | null>(null)
  const [pickingScheduleIdx, setPickingScheduleIdx] = useState<number | null>(null)
  // Set when "Buat Jadwal" is clicked but the CSV host name can't be resolved
  // to a profile -- the row then asks which host it was before creating.
  const [pickingHostIdx, setPickingHostIdx] = useState<number | null>(null)
  // Bulk "Buat Jadwal untuk Semua" — for backfilling months of historical CSV
  // data where no schedule ever existed, instead of clicking every row.
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })
  const [bulkSummary, setBulkSummary] = useState<{ created: number; skippedNoHost: number; failed: { line: number; brand: string; error: string }[] } | null>(null)
  const [showBulkFailures, setShowBulkFailures] = useState(false)
  const [detailRow, setDetailRow] = useState<CompareRow | null>(null)
  const [editForm, setEditForm] = useState<{
    host_id: string; start_time: string; platform: string
    gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  } | null>(null)
  const [savingDetail, setSavingDetail] = useState(false)
  const [detailSaveError, setDetailSaveError] = useState('')
  // Session-only log of rows corrected via the detail popup: csv row index -> ISO timestamp fixed.
  const [fixedLog, setFixedLog] = useState<Record<number, string>>({})
  // Rows where the CSV is the wrong one -- the host's own report is correct,
  // so the difference is expected and the row shouldn't keep flagging as
  // "Berbeda" forever. csv row index -> ISO timestamp accepted.
  const [acceptedApp, setAcceptedApp] = useState<Record<number, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  // The ±1-day-widened date range the currently-loaded CSV was fetched
  // against -- kept so a refresh can re-fetch live_reports/schedule_slots
  // for the same window without needing the CSV file again.
  const fetchRangeRef = useRef<{ start: string; end: string } | null>(null)

  // Re-fetches live_reports/schedule_slots/hosts/rooms for a date range,
  // WITHOUT touching csvRows or any manual match/dismiss state -- used both
  // by the initial CSV upload and by refreshData() below, so "the Duplikat
  // tab changed something" and "I just uploaded a CSV" both converge on the
  // same fetch instead of two separate, potentially-diverging code paths.
  async function fetchAppData(fetchStart: string, fetchEnd: string) {
    setLoading(true)
    const supabase = createClient()
    const [reportsRes, slotsRes, hostsRes, roomsRes] = await Promise.all([
      supabase.from('live_reports')
        .select('id, report_date, host_id, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, screenshot_url, notes, slot_id, profiles:host_id(full_name, username)')
        .gte('report_date', fetchStart).lte('report_date', fetchEnd),
      supabase.from('schedule_slots')
        .select('id, slot_date, session_no, jam_mulai, durasi, brand, platform, host_id')
        .gte('slot_date', fetchStart).lte('slot_date', fetchEnd).not('host_id', 'is', null),
      supabase.from('profiles').select('id, full_name, username').in('role', ['host', 'host_manager']),
      supabase.from('rooms').select('id, name').eq('is_active', true).order('sort_order'),
    ])
    setAppReports((reportsRes.data as any) || [])
    setScheduleSlots((slotsRes.data as any) || [])
    setHosts(hostsRes.data || [])
    setRooms(roomsRes.data || [])
    setLoading(false)
  }

  // Re-fetches for the CSV already loaded, without re-parsing the file --
  // called on refreshSignal (Duplikat tab made a change) and by the manual
  // "Muat Ulang" button. A no-op if no CSV is loaded yet.
  function refreshData() {
    if (!fetchRangeRef.current) return
    fetchAppData(fetchRangeRef.current.start, fetchRangeRef.current.end)
  }

  // Runs on every refreshSignal bump except the very first render (there's
  // nothing to refresh before a CSV has even been uploaded once).
  const skipFirstRefresh = useRef(true)
  useEffect(() => {
    if (skipFirstRefresh.current) { skipFirstRefresh.current = false; return }
    refreshData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const text = await file.text()
    const { headers, rows } = parseCsvText(text)

    const alias: Record<string, string> = {
      tanggal: 'tanggal', brand: 'brand', room: 'room',
      'start sesi': 'startSesi', 'total jam': 'totalJam', host: 'host', platform: 'platform',
      gmv: 'gmv', impression: 'impression', viewer: 'viewer', trans: 'trans', comment: 'comment',
    }
    const colMap: Record<number, string> = {}
    headers.forEach((h, i) => { const key = alias[h.toLowerCase().trim()]; if (key) colMap[i] = key })

    const parsed: CsvRow[] = rows.map((row, li) => {
      const obj: Record<string, string> = {}
      Object.entries(colMap).forEach(([ci, key]) => { obj[key] = (row[Number(ci)] || '').trim() })
      return {
        _line: li + 2,
        tanggal: parseDate(obj.tanggal || ''), brand: obj.brand || '', room: obj.room || '',
        startSesi: parseTime(obj.startSesi || ''), totalJam: parseFloat(obj.totalJam || '0') || 0,
        host: obj.host || '', platform: normalizePlatform(obj.platform || ''),
        gmv: parseRp(obj.gmv || '0'), impression: parseNum(obj.impression || '0'), viewer: parseNum(obj.viewer || '0'),
        trans: parseNum(obj.trans || '0'), comment: parseNum(obj.comment || '0'),
      }
    }).filter(r => r.tanggal)

    setCsvRows(parsed)
    setManualMatches({})
    setNotReportedMatches({})
    setNotReportedReportIds({})
    setCreatedSlotIds({})
    setFixedLog({})
    setAcceptedApp({})
    e.target.value = ''
    if (!parsed.length) { fetchRangeRef.current = null; return }

    const minDate = parsed.reduce((m, r) => r.tanggal < m ? r.tanggal : m, parsed[0].tanggal)
    const maxDate = parsed.reduce((m, r) => r.tanggal > m ? r.tanggal : m, parsed[0].tanggal)
    // Widen by a day on each side so midnight-crossing sessions can still be found.
    const fetchStart = shiftDate(minDate, -1)
    const fetchEnd = shiftDate(maxDate, 1)
    fetchRangeRef.current = { start: fetchStart, end: fetchEnd }
    await fetchAppData(fetchStart, fetchEnd)
  }

  const hostMap = useMemo(() => {
    const map: Record<string, string> = {}
    hosts.forEach(h => {
      map[h.full_name.toLowerCase()] = h.id
      const first = h.full_name.split(' ')[0].toLowerCase()
      if (!map[first]) map[first] = h.id
      if (h.username) {
        const u = h.username.toLowerCase()
        if (!map[u]) map[u] = h.id
      }
    })
    return map
  }, [hosts])

  const appById = useMemo(() => {
    const map: Record<string, AppReport> = {}
    appReports.forEach(r => { map[r.id] = r })
    return map
  }, [appReports])

  const scheduleById = useMemo(() => {
    const map: Record<string, ScheduleSlotRow> = {}
    scheduleSlots.forEach(s => { map[s.id] = s })
    return map
  }, [scheduleSlots])

  const compareRows: CompareRow[] = useMemo(() => {
    if (!csvRows.length) return []
    const byDateHost: Record<string, AppReport[]> = {}
    appReports.forEach(r => {
      const key = `${r.report_date}|${r.host_id}`
      ;(byDateHost[key] ||= []).push(r)
    })
    const usedByAuto = new Set<string>()
    return csvRows.map((csv, csvIdx) => {
      const manualId = manualMatches[csvIdx]
      let app: AppReport | null = null
      let isManual = false
      if (manualId) {
        app = appById[manualId] || null
        isManual = !!app
      } else {
        const hostId = hostMap[csv.host.toLowerCase()] || hostMap[csv.host.split(' ')[0].toLowerCase()]
        if (hostId) {
          const candidates = (byDateHost[`${csv.tanggal}|${hostId}`] || []).filter(c => !usedByAuto.has(c.id))
          app = candidates.find(c => c.start_time?.slice(0, 5) === csv.startSesi) || (candidates.length === 1 ? candidates[0] : null)
          if (app) usedByAuto.add(app.id)
        }
      }
      const mismatches = new Set<Metric>()
      if (app) {
        if (Number(app.gmv) !== csv.gmv) mismatches.add('gmv')
        if (Number(app.impression) !== csv.impression) mismatches.add('impression')
        if (Number(app.viewer) !== csv.viewer) mismatches.add('viewer')
        if (Number(app.trans) !== csv.trans) mismatches.add('trans')
        if (Number(app.comment_count) !== csv.comment) mismatches.add('comment')
      }
      let status: CompareRow['status'] = !app ? 'missing_in_app' : mismatches.size > 0 ? 'mismatch' : 'match'
      let notReportedSlot: ScheduleSlotRow | null = null
      if (notReportedMatches[csvIdx]) {
        // Once confirmed, the row now has a real (freshly-inserted) app match
        // too -- keep it tagged "not reported" rather than falling back to a
        // plain "Cocok", since the report only exists because CSV filled it in.
        notReportedSlot = scheduleById[notReportedMatches[csvIdx]] || null
        if (notReportedSlot) status = 'not_reported_confirmed'
      } else if (app?.notes === 'CSV') {
        // Session state (notReportedMatches) resets on every re-upload/reload,
        // but the DB row itself is tagged notes='CSV' -- use that as the
        // durable source of truth so the badge survives a page revisit.
        status = 'not_reported_confirmed'
      }
      // "App yang benar": the host's report is right and the CSV is wrong, so
      // this row is settled. Clearing mismatches too keeps the row visually
      // clean (no leftover pink cells under a green badge) and moves it out
      // of the Berbeda count/filter, same as a genuine match.
      const isAcceptedApp = !!acceptedApp[csvIdx] && status === 'mismatch'
      if (isAcceptedApp) { mismatches.clear(); status = 'match' }
      return { csv, csvIdx, app, mismatches, status, isManual, notReportedSlot, acceptedApp: isAcceptedApp }
    })
  }, [csvRows, appReports, hostMap, manualMatches, appById, notReportedMatches, scheduleById, acceptedApp])

  const usedAppIds = useMemo(() => new Set(compareRows.filter(r => r.app).map(r => r.app!.id)), [compareRows])

  const extraAppReports = useMemo(() =>
    appReports.filter(r => !usedAppIds.has(r.id)).sort((a, b) => a.report_date.localeCompare(b.report_date)),
    [appReports, usedAppIds])

  // Schedule slots that already have a live_report tied to them (whether
  // reported normally or confirmed via "Tidak Lapor") -- hide these from the
  // "Tidak Lapor" picker so a slot can't be picked twice. Only counts if the
  // report's own date actually falls within ±1 day of the slot's date --
  // hosts can pick ANY past slot when submitting (no date window enforced),
  // so a report submitted long after its selected slot's real date must not
  // poison that slot's availability for the CSV row that actually matches it.
  const usedSlotIds = useMemo(() => {
    const used = new Set<string>()
    appReports.forEach(r => {
      if (!r.slot_id) return
      const slot = scheduleById[r.slot_id]
      if (!slot) { used.add(r.slot_id); return }
      const prev = shiftDate(slot.slot_date, -1), next = shiftDate(slot.slot_date, 1)
      if (r.report_date === prev || r.report_date === slot.slot_date || r.report_date === next) used.add(r.slot_id)
    })
    return used
  }, [appReports, scheduleById])

  function resolveHostId(csv: CsvRow): string | undefined {
    return hostMap[csv.host.toLowerCase()] || hostMap[csv.host.split(' ')[0].toLowerCase()]
  }

  // Candidates offered in the manual-match picker for a given CSV row: only
  // yesterday/today/tomorrow relative to the CSV row's date (sessions that
  // cross midnight can land on the day before/after), same date sorted first,
  // and narrowed to the same host OR the same brand -- either signal alone is
  // enough, so a host whose CSV spelling doesn't resolve is still narrowed by
  // brand, and a brand spelled differently is still narrowed by host.
  function candidatesFor(csv: CsvRow) {
    const prev = shiftDate(csv.tanggal, -1)
    const next = shiftDate(csv.tanggal, 1)
    const hostId = resolveHostId(csv)
    return extraAppReports
      .filter(r => r.report_date === prev || r.report_date === csv.tanggal || r.report_date === next)
      .filter(r => (!!hostId && r.host_id === hostId) || brandsMatch(r.brand || '', csv.brand))
      .sort((a, b) => {
        const aSame = a.report_date === csv.tanggal ? 0 : 1
        const bSame = b.report_date === csv.tanggal ? 0 : 1
        if (aSame !== bSame) return aSame - bSame
        return a.report_date.localeCompare(b.report_date)
      })
  }

  function setManualMatch(csvIdx: number, appId: string) {
    setManualMatches(prev => ({ ...prev, [csvIdx]: appId }))
    setPickingIdx(null)
  }
  function clearManualMatch(csvIdx: number) {
    setManualMatches(prev => { const n = { ...prev }; delete n[csvIdx]; return n })
  }

  // Candidates for "host tidak lapor" confirmation: schedule slots (not live
  // reports) in the ±1 day window that aren't already taken by a report,
  // narrowed the same way as the manual-match picker: same host OR same brand.
  function scheduleCandidatesFor(csv: CsvRow) {
    const prev = shiftDate(csv.tanggal, -1)
    const next = shiftDate(csv.tanggal, 1)
    const hostId = resolveHostId(csv)
    return scheduleSlots
      .filter(s => s.slot_date === prev || s.slot_date === csv.tanggal || s.slot_date === next)
      .filter(s => !usedSlotIds.has(s.id))
      .filter(s => (!!hostId && s.host_id === hostId) || brandsMatch(s.brand || '', csv.brand))
      .sort((a, b) => {
        const aSame = a.slot_date === csv.tanggal ? 0 : 1
        const bSame = b.slot_date === csv.tanggal ? 0 : 1
        if (aSame !== bSame) return aSame - bSame
        return a.slot_date.localeCompare(b.slot_date)
      })
  }

  // Confirming "Tidak Lapor" now actually creates the live_report using the
  // CSV's own numbers, linked to the chosen schedule slot -- so it becomes a
  // real record (counted in payroll hours, recap, etc.), not just a UI tag.
  async function setNotReportedMatch(csvIdx: number, slotId: string) {
    const csv = csvRows[csvIdx]
    const slot = scheduleById[slotId]
    if (!csv || !slot) return
    setSavingNotReportedIdx(csvIdx); setNotReportedError('')
    const { data, error } = await createClient().from('live_reports').insert({
      slot_id: slot.id, host_id: slot.host_id, report_date: csv.tanggal,
      brand: csv.brand || slot.brand, platform: csv.platform || slot.platform,
      start_time: csv.startSesi || slot.jam_mulai, duration_hours: csv.totalJam || slot.durasi,
      gmv: csv.gmv, impression: csv.impression, viewer: csv.viewer, trans: csv.trans, comment_count: csv.comment,
      notes: 'CSV',
    }).select('id, report_date, host_id, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, screenshot_url, notes, slot_id, profiles:host_id(full_name, username)').single()
    setSavingNotReportedIdx(null)
    if (error) { setNotReportedError(error.message); return }
    if (data) {
      setAppReports(prev => [...prev, data as any])
      setNotReportedMatches(prev => ({ ...prev, [csvIdx]: slotId }))
      setNotReportedReportIds(prev => ({ ...prev, [csvIdx]: (data as any).id }))
      setPickingScheduleIdx(null)
    }
  }

  async function clearNotReportedMatch(csvIdx: number, fallbackReportId?: string) {
    const reportId = notReportedReportIds[csvIdx] || fallbackReportId
    const supabase = createClient()
    if (reportId) {
      await supabase.from('live_reports').delete().eq('id', reportId)
      setAppReports(prev => prev.filter(a => a.id !== reportId))
    }
    // If this row's slot was created here by "Buat Jadwal", undo that too --
    // otherwise Batalkan would leave an empty slot behind on the Schedule page.
    const slotId = createdSlotIds[csvIdx]
    if (slotId) {
      await supabase.from('schedule_slots').delete().eq('id', slotId)
      setScheduleSlots(prev => prev.filter(s => s.id !== slotId))
      setCreatedSlotIds(prev => { const n = { ...prev }; delete n[csvIdx]; return n })
    }
    setNotReportedMatches(prev => { const n = { ...prev }; delete n[csvIdx]; return n })
    setNotReportedReportIds(prev => { const n = { ...prev }; delete n[csvIdx]; return n })
  }

  // CSV rows whose session was never put on the schedule at all: create the
  // schedule_slot from the CSV (so it shows up on the Schedule page), then
  // attach the CSV's numbers to it as a live_report, same as "Tidak Lapor".
  async function makeScheduleFor(csvIdx: number, hostIdOverride?: string, silent = false): Promise<{ ok: boolean; error?: string }> {
    const csv = csvRows[csvIdx]
    if (!csv) return { ok: false, error: 'Baris tidak ditemukan' }
    const hostId = hostIdOverride || resolveHostId(csv)
    if (!hostId) {
      if (!silent) setPickingHostIdx(csvIdx)
      return { ok: false, error: 'Host tidak dikenali' }
    }
    if (!csv.startSesi) {
      const msg = `Baris ${csv._line}: jam mulai kosong, tidak bisa buat jadwal.`
      if (!silent) setNotReportedError(msg)
      return { ok: false, error: msg }
    }

    setSavingNotReportedIdx(csvIdx); setNotReportedError(''); setPickingHostIdx(null)
    const supabase = createClient()
    // session_no is the hour + 1 (session 1 = 00:00–01:00), matching the
    // SESSION_LABELS mapping the Schedule page is built on.
    const sessionNo = Number(csv.startSesi.slice(0, 2)) + 1
    const slotPayload = {
      slot_date: csv.tanggal, session_no: sessionNo,
      host_id: hostId, brand: csv.brand || null, platform: csv.platform || null,
      jam_mulai: csv.startSesi, durasi: csv.totalJam || null, status: 'scheduled',
    }

    // (slot_date, session_no, room_id) is unique, so the CSV's own room may
    // already be occupied at that hour -- fall back through the other rooms
    // rather than failing outright.
    const preferred = resolveRoomId(csv.room)
    const roomOrder = [preferred, ...rooms.map(r => r.id).filter(id => id !== preferred)].filter(Boolean) as string[]
    let slot: ScheduleSlotRow | null = null
    let lastErr = ''
    for (const roomId of roomOrder) {
      const { data, error } = await supabase.from('schedule_slots')
        .insert({ ...slotPayload, room_id: roomId })
        .select('id, slot_date, session_no, jam_mulai, durasi, brand, platform, host_id').single()
      if (!error && data) { slot = data as any; break }
      lastErr = error?.message || ''
      if (!/duplicate|unique/i.test(lastErr)) break
    }
    if (!slot) {
      setSavingNotReportedIdx(null)
      if (!silent) setNotReportedError(lastErr || 'Gagal membuat jadwal.')
      return { ok: false, error: lastErr || 'Gagal membuat jadwal.' }
    }

    const { data: report, error: repErr } = await supabase.from('live_reports').insert({
      slot_id: slot.id, host_id: hostId, report_date: csv.tanggal,
      brand: csv.brand || null, platform: csv.platform || null,
      start_time: csv.startSesi, duration_hours: csv.totalJam || null,
      gmv: csv.gmv, impression: csv.impression, viewer: csv.viewer, trans: csv.trans, comment_count: csv.comment,
      notes: 'CSV',
    }).select('id, report_date, host_id, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, screenshot_url, notes, slot_id, profiles:host_id(full_name, username)').single()
    setSavingNotReportedIdx(null)
    if (repErr) {
      // Roll the slot back so a failed report doesn't strand an empty slot.
      await supabase.from('schedule_slots').delete().eq('id', slot.id)
      if (!silent) setNotReportedError(repErr.message)
      return { ok: false, error: repErr.message }
    }

    setScheduleSlots(prev => [...prev, slot!])
    setCreatedSlotIds(prev => ({ ...prev, [csvIdx]: slot!.id }))
    if (report) {
      setAppReports(prev => [...prev, report as any])
      setNotReportedMatches(prev => ({ ...prev, [csvIdx]: slot!.id }))
      setNotReportedReportIds(prev => ({ ...prev, [csvIdx]: (report as any).id }))
    }
    return { ok: true }
  }

  function resolveRoomId(csvRoom: string): string | null {
    if (!rooms.length) return null
    const n = normBrand(csvRoom)
    const exact = n ? rooms.find(r => normBrand(r.name) === n) : null
    const fuzzy = n ? rooms.find(r => normBrand(r.name).includes(n) || n.includes(normBrand(r.name))) : null
    return (exact || fuzzy)?.id || rooms.find(r => /lain/i.test(r.name))?.id || rooms[0].id
  }

  // Runs makeScheduleFor across every row still "Tak Ada di App" -- for
  // backfilling months of historical data where no schedule was ever entered,
  // rather than clicking "Buat Jadwal" one row at a time. Sequential (not
  // parallel) so it doesn't hammer Supabase with hundreds of simultaneous
  // inserts, and so progress can be shown as it goes.
  async function bulkCreateSchedule() {
    const targets = compareRows.filter(r => r.status === 'missing_in_app')
    setBulkRunning(true); setBulkSummary(null); setShowBulkFailures(false)
    setBulkProgress({ done: 0, total: targets.length })

    let created = 0, skippedNoHost = 0
    const failed: { line: number; brand: string; error: string }[] = []

    for (let i = 0; i < targets.length; i++) {
      const r = targets[i]
      const hostId = resolveHostId(r.csv)
      if (!hostId) {
        skippedNoHost++
      } else {
        const result = await makeScheduleFor(r.csvIdx, hostId, true)
        if (result.ok) created++
        else failed.push({ line: r.csv._line, brand: r.csv.brand || '—', error: result.error || 'Gagal' })
      }
      setBulkProgress({ done: i + 1, total: targets.length })
    }

    setBulkSummary({ created, skippedNoHost, failed })
    setBulkRunning(false)
  }

  const hostNameById = useMemo(() => {
    const map: Record<string, string> = {}
    hosts.forEach(h => { map[h.id] = h.username || h.full_name.split(' ')[0] })
    return map
  }, [hosts])

  const totalMatch = compareRows.filter(r => r.status === 'match').length
  const totalMismatch = compareRows.filter(r => r.status === 'mismatch').length
  const totalMissing = compareRows.filter(r => r.status === 'missing_in_app').length
  const totalNotReported = compareRows.filter(r => r.status === 'not_reported_confirmed').length

  const visibleRows = compareRows.filter(r => statusFilter === 'all' ? true : r.status === statusFilter)

  function openDetail(r: CompareRow) {
    setDetailRow(r)
    setDetailSaveError('')
    setEditForm(r.app ? {
      host_id: r.app.host_id, start_time: r.app.start_time?.slice(0, 5) || '', platform: r.app.platform || '',
      gmv: Number(r.app.gmv) || 0, impression: Number(r.app.impression) || 0, viewer: Number(r.app.viewer) || 0,
      trans: Number(r.app.trans) || 0, comment_count: Number(r.app.comment_count) || 0,
    } : null)
  }

  function closeDetail() {
    setDetailRow(null)
    setEditForm(null)
    setDetailSaveError('')
  }

  async function saveDetailEdit() {
    if (!detailRow?.app || !editForm) return
    // Saving a form nobody actually edited writes the same numbers back and
    // leaves the row "Berbeda" -- which reads as a broken save. Say what's
    // wrong instead of issuing a pointless write.
    const app = detailRow.app
    const unchanged =
      editForm.host_id === app.host_id &&
      (editForm.start_time || '') === (app.start_time?.slice(0, 5) || '') &&
      (editForm.platform || '') === (app.platform || '') &&
      editForm.gmv === (Number(app.gmv) || 0) &&
      editForm.impression === (Number(app.impression) || 0) &&
      editForm.viewer === (Number(app.viewer) || 0) &&
      editForm.trans === (Number(app.trans) || 0) &&
      editForm.comment_count === (Number(app.comment_count) || 0)
    if (unchanged) {
      setDetailSaveError('Nilai app sudah sama dengan yang di form — tidak ada yang perlu disimpan. Kalau CSV-nya yang salah, klik "Data App Benar". Kalau app-nya yang salah, pakai "← Samakan Semua dengan CSV" atau "← CSV" di baris merah.')
      return
    }
    setSavingDetail(true); setDetailSaveError('')
    const supabase = createClient()
    const { data, error } = await supabase.from('live_reports').update({
      host_id: editForm.host_id,
      start_time: editForm.start_time || null,
      platform: editForm.platform || null,
      gmv: editForm.gmv, impression: editForm.impression, viewer: editForm.viewer,
      trans: editForm.trans, comment_count: editForm.comment_count,
    }).eq('id', detailRow.app.id)
      .select('id, report_date, host_id, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, screenshot_url, notes, slot_id, profiles:host_id(full_name, username)')
    setSavingDetail(false)
    if (error) { setDetailSaveError(error.message); return }
    // No .single() here on purpose: an UPDATE that matches no row is not a
    // Postgres error, so .single() would surface it as a cryptic "0 rows"
    // parse failure. Matching 0 rows means this report no longer exists --
    // typically deleted from the Duplikat tab -- or RLS blocked the write.
    // Either way the snapshot is stale, so say so plainly and refetch rather
    // than letting it look like the save silently did nothing.
    if (!data || data.length === 0) {
      setDetailSaveError('Baris ini sudah tidak ada di database (mungkin sudah dihapus di tab Duplikat). Data dimuat ulang — tutup lalu coba lagi.')
      refreshData()
      return
    }
    const updated = data[0] as any
    setAppReports(prev => prev.map(a => a.id === updated.id ? updated : a))
    setFixedLog(prev => ({ ...prev, [detailRow.csvIdx]: new Date().toISOString() }))
    closeDetail()
  }

  return (
    <div className="w-full">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <p className="text-sm font-bold text-gray-900 mb-1">{tr('uploadCsvRekonTitle', lang)}</p>
        <p className="text-xs text-gray-500 mb-3">{tr('uploadCsvRekonDesc', lang)}</p>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile}/>
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3.5 py-2 rounded-xl font-medium hover:bg-brand-700 transition-colors shadow-sm">
            <Upload size={14}/> {tr('pilihFileCsv', lang)}
          </button>
          {csvRows.length > 0 && (
            <button onClick={refreshData} disabled={loading}
              title="Ambil ulang data app terbaru untuk CSV yang sudah dimuat -- pakai ini setelah membereskan sesuatu di tab Duplikat"
              className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 px-3.5 py-2 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> Muat Ulang Data
            </button>
          )}
        </div>
        {fileName && <p className="text-xs text-gray-400 mt-2">{loading ? tr('loading', lang) : `File: ${fileName} · ${csvRows.length} baris`}</p>}
      </div>

      {csvRows.length > 0 && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            {[
              { key: 'all' as const, label: tr('totalBarisCard', lang), value: compareRows.length, icon: null, color: 'bg-gray-50 border-gray-100 text-gray-700' },
              { key: 'all' as const, label: tr('cocokCard', lang), value: totalMatch, icon: CheckCircle2, color: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
              { key: 'mismatch' as const, label: tr('bedaCard', lang), value: totalMismatch, icon: AlertTriangle, color: 'bg-pink-50 border-pink-100 text-pink-700' },
              { key: 'missing_in_app' as const, label: tr('takAdaDiApp', lang), value: totalMissing, icon: XCircle, color: 'bg-red-50 border-red-100 text-red-700' },
              { key: 'not_reported_confirmed' as const, label: tr('takLaporCsv', lang), value: totalNotReported, icon: CalendarSearch, color: 'bg-purple-50 border-purple-100 text-purple-700' },
            ].map(({ key, label, value, icon: Icon, color }) => (
              <button key={label} onClick={() => setStatusFilter(key)}
                className={`rounded-2xl border p-4 text-left flex items-center gap-3 ${color} ${statusFilter === key ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
                {Icon && <Icon size={18} className="flex-shrink-0 opacity-70"/>}
                <div>
                  <p className="text-xs opacity-70 font-medium">{label}</p>
                  <p className="text-lg font-bold leading-tight">{value}</p>
                </div>
              </button>
            ))}
          </div>

          {notReportedError && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between gap-3">
              <p className="text-xs text-red-600">{tr('gagalMenyimpan', lang)}: {notReportedError}</p>
              <button onClick={() => setNotReportedError('')} className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={14}/></button>
            </div>
          )}

          {/* Bulk backfill: create schedule + report for every "Tak Ada di App" row at once */}
          {totalMissing > 0 && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 mb-4">
              {bulkRunning ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-emerald-800 mb-1.5">
                      {tr('bulkCreatingProgress', lang)} {bulkProgress.done}/{bulkProgress.total}
                    </p>
                    <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                        style={{ width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }}/>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-emerald-800">
                    {totalMissing} {tr('bulkBackfillDesc', lang)}
                  </p>
                  <button onClick={bulkCreateSchedule}
                    className="flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-xl hover:bg-emerald-700 transition-colors flex-shrink-0">
                    <CalendarPlus size={12}/> {tr('buatJadwalSemua', lang)} ({totalMissing})
                  </button>
                </div>
              )}

              {bulkSummary && (
                <div className="mt-3 pt-3 border-t border-emerald-100 text-xs">
                  <p className="text-emerald-800 font-semibold">
                    ✓ {bulkSummary.created} {tr('berhasilDibuat', lang)}
                    {bulkSummary.skippedNoHost > 0 && ` · ${bulkSummary.skippedNoHost} ${tr('dilewatiHostTidakDikenali', lang)}`}
                    {bulkSummary.failed.length > 0 && ` · ${bulkSummary.failed.length} ${tr('gagalCard', lang)}`}
                  </p>
                  {bulkSummary.failed.length > 0 && (
                    <>
                      <button onClick={() => setShowBulkFailures(s => !s)}
                        className="text-red-600 hover:text-red-700 font-medium mt-1">
                        {showBulkFailures ? tr('hideGroup', lang) : tr('showGroup', lang)} {tr('lihatBarisGagal', lang)}
                      </button>
                      {showBulkFailures && (
                        <ul className="mt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                          {bulkSummary.failed.map((f, i) => (
                            <li key={i} className="text-red-600">{tr('barisLabel', lang)} {f.line} ({f.brand}): {f.error}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                    <th className="px-1.5 py-2 text-left font-semibold whitespace-nowrap">{tr('date', lang)}</th>
                    <th className="px-1.5 py-2 text-left font-semibold whitespace-nowrap">{tr('jamMulaiCol', lang)}</th>
                    <th className="px-1.5 py-2 text-right font-semibold whitespace-nowrap">{tr('totalJamLiveCol', lang)}</th>
                    <th className="px-1.5 py-2 text-left font-semibold">{tr('host', lang)}</th>
                    <th className="px-1.5 py-2 text-left font-semibold">{tr('brandCsvCol', lang)}</th>
                    <th className="px-1.5 py-2 text-left font-semibold">{tr('platform', lang)}</th>
                    <th className="px-1.5 py-2 text-right font-semibold">{tr('gmvCol', lang)}</th>
                    <th className="px-1.5 py-2 text-right font-semibold">{tr('impresiCol', lang)}</th>
                    <th className="px-1.5 py-2 text-right font-semibold">{tr('penontonCol', lang)}</th>
                    <th className="px-1.5 py-2 text-right font-semibold">{tr('transCol', lang)}</th>
                    <th className="px-1.5 py-2 text-right font-semibold">{tr('komentarCol', lang)}</th>
                    <th className="px-1.5 py-2 text-center font-semibold">{tr('status', lang)}</th>
                    <th className="px-1.5 py-2 text-center font-semibold">{tr('aksiCol', lang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleRows.map((r, idx) => (
                    <tr key={idx} className={r.status === 'missing_in_app' ? 'bg-red-50/50' : r.status === 'not_reported_confirmed' ? 'bg-purple-50/40' : ''}>
                      <td className="px-1.5 py-1.5 whitespace-nowrap text-gray-600 text-[11px]">{fmtDate(r.csv.tanggal)}</td>
                      <td className="px-1.5 py-1.5 whitespace-nowrap"><span className="font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded-lg text-[11px]">{r.csv.startSesi}</span></td>
                      <td className="px-1.5 py-1.5 text-right whitespace-nowrap text-gray-600 text-[11px]">{r.csv.totalJam ? `${r.csv.totalJam}${tr('jamSuffix', lang)}` : '—'}</td>
                      <td className="px-1.5 py-1.5 font-medium text-gray-800 whitespace-nowrap text-[11px]">{r.csv.host}</td>
                      <td className="px-1.5 py-1.5 text-gray-600 max-w-[110px] truncate text-[11px]">{r.csv.brand}</td>
                      <td className="px-1.5 py-1.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${PLATFORM_COLORS[r.csv.platform] || PLATFORM_COLORS.Other}`}>
                          {r.csv.platform}
                        </span>
                      </td>
                      <MetricCell csvVal={r.csv.gmv} appVal={r.app ? Number(r.app.gmv) : undefined} mismatch={r.mismatches.has('gmv')} fmt={formatCurrency}/>
                      <MetricCell csvVal={r.csv.impression} appVal={r.app ? Number(r.app.impression) : undefined} mismatch={r.mismatches.has('impression')} fmt={fmtNum}/>
                      <MetricCell csvVal={r.csv.viewer} appVal={r.app ? Number(r.app.viewer) : undefined} mismatch={r.mismatches.has('viewer')} fmt={fmtNum}/>
                      <MetricCell csvVal={r.csv.trans} appVal={r.app ? Number(r.app.trans) : undefined} mismatch={r.mismatches.has('trans')} fmt={fmtNum}/>
                      <MetricCell csvVal={r.csv.comment} appVal={r.app ? Number(r.app.comment_count) : undefined} mismatch={r.mismatches.has('comment')} fmt={fmtNum}/>
                      <td className="px-1.5 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {r.status === 'match' && (
                            r.acceptedApp ? (
                              <span className="text-[9px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap"
                                title="Data app dianggap benar, CSV-nya yang salah">
                                App Benar
                              </span>
                            ) : fixedLog[r.csvIdx] ? (
                              <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">
                                {tr('fixedLabel', lang)} · {fmtFixedDate(fixedLog[r.csvIdx])}
                              </span>
                            ) : (
                              <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">{tr('cocokCard', lang)}</span>
                            )
                          )}
                          {r.status === 'mismatch' && <span className="text-[9px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">{tr('bedaCard', lang)}</span>}
                          {r.status === 'missing_in_app' && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">{tr('takAdaDiApp', lang)}</span>}
                          {r.status === 'not_reported_confirmed' && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">{tr('takLaporCsv', lang)}</span>}
                          {r.isManual && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">{tr('manualBadge', lang)}</span>}
                        </div>
                        {r.status === 'not_reported_confirmed' && (
                          <p className="text-[9px] text-purple-400 italic mt-0.5">CSV</p>
                        )}
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        {r.isManual ? (
                          <button onClick={() => clearManualMatch(r.csvIdx)}
                            className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg px-2 py-1 transition-colors">
                            <X size={10}/> {tr('batalkan', lang)}
                          </button>
                        ) : r.status === 'not_reported_confirmed' ? (
                          <button onClick={() => clearNotReportedMatch(r.csvIdx, r.app?.id)}
                            className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg px-2 py-1 transition-colors">
                            <X size={10}/> {tr('batalkan', lang)}
                          </button>
                        ) : r.status === 'missing_in_app' ? (
                          pickingIdx === r.csvIdx ? (
                            <select autoFocus defaultValue=""
                              onChange={e => { if (e.target.value) setManualMatch(r.csvIdx, e.target.value) }}
                              onBlur={() => setPickingIdx(null)}
                              className="text-[10px] border border-brand-300 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white max-w-[280px]">
                              <option value="">{tr('pilihLaporanApp', lang)}</option>
                              {candidatesFor(r.csv).map(c => {
                                const p = c.profiles as any
                                const nick = p?.username || p?.full_name?.split(' ')[0] || '—'
                                return (
                                  <option key={c.id} value={c.id}>
                                    {shortDate(c.report_date)} · {c.start_time?.slice(0,5) || '—'} · {c.duration_hours ? `${c.duration_hours}${tr('jamSuffix', lang)}` : '—'} · {nick} · {c.brand || '—'}
                                  </option>
                                )
                              })}
                            </select>
                          ) : savingNotReportedIdx === r.csvIdx ? (
                            <span className="text-[10px] text-purple-500 whitespace-nowrap">{tr('saving', lang)}</span>
                          ) : pickingScheduleIdx === r.csvIdx ? (
                            <select autoFocus defaultValue=""
                              onChange={e => { if (e.target.value) setNotReportedMatch(r.csvIdx, e.target.value) }}
                              onBlur={() => setPickingScheduleIdx(null)}
                              className="text-[10px] border border-purple-300 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white max-w-[280px]">
                              <option value="">{tr('pilihJadwal', lang)}</option>
                              {scheduleCandidatesFor(r.csv).map(s => (
                                <option key={s.id} value={s.id}>
                                  {shortDate(s.slot_date)} · {slotTime(s)} · {s.durasi ? `${s.durasi}${tr('jamSuffix', lang)}` : '—'} · {hostNameById[s.host_id] || '—'} · {s.brand || '—'}
                                </option>
                              ))}
                            </select>
                          ) : pickingHostIdx === r.csvIdx ? (
                            <select autoFocus defaultValue=""
                              onChange={e => { if (e.target.value) makeScheduleFor(r.csvIdx, e.target.value) }}
                              onBlur={() => setPickingHostIdx(null)}
                              className="text-[10px] border border-emerald-300 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white max-w-[280px]">
                              <option value="">{tr('hostSiapa', lang)}</option>
                              {hosts.map(h => (
                                <option key={h.id} value={h.id}>{h.username || h.full_name}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setPickingIdx(r.csvIdx)}
                                className="inline-flex items-center gap-1 text-[10px] text-brand-600 hover:text-brand-800 border border-brand-200 rounded-lg px-2 py-1 hover:bg-brand-50 transition-colors whitespace-nowrap">
                                <Link2 size={10}/> {tr('matchManual', lang)}
                              </button>
                              <button onClick={() => setPickingScheduleIdx(r.csvIdx)}
                                className="inline-flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-800 border border-purple-200 rounded-lg px-2 py-1 hover:bg-purple-50 transition-colors whitespace-nowrap">
                                <CalendarSearch size={10}/> {tr('tidakLapor', lang)}
                              </button>
                              <button onClick={() => makeScheduleFor(r.csvIdx)}
                                className="inline-flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-800 border border-emerald-200 rounded-lg px-2 py-1 hover:bg-emerald-50 transition-colors whitespace-nowrap">
                                <CalendarPlus size={10}/> {tr('buatJadwal', lang)}
                              </button>
                            </div>
                          )
                        ) : r.status === 'mismatch' ? (
                          <button onClick={() => openDetail(r)}
                            className="inline-flex items-center gap-1 text-[10px] text-pink-600 hover:text-pink-800 border border-pink-200 rounded-lg px-2 py-1 hover:bg-pink-50 transition-colors whitespace-nowrap">
                            <ExternalLink size={10}/> {tr('detailBtn', lang)}
                          </button>
                        ) : (
                          <span className="text-gray-300 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {extraAppReports.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-xs font-bold text-amber-700 mb-2">
                {extraAppReports.length} {tr('laporanDiAppTidakDiCsv', lang)}
              </p>
              <div className="space-y-1">
                {extraAppReports.map(r => (
                  <p key={r.id} className="text-[11px] text-amber-600">
                    {fmtDate(r.report_date)} · {r.start_time?.slice(0, 5)} · {(r.profiles as any)?.full_name || '—'} · {r.brand} · {r.platform}
                  </p>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Mismatch detail: App (editable) vs CSV (reference) side by side, with the app's screenshot */}
      {detailRow && (() => {
        const live = editForm ? {
          gmv: editForm.gmv !== detailRow.csv.gmv,
          impression: editForm.impression !== detailRow.csv.impression,
          viewer: editForm.viewer !== detailRow.csv.viewer,
          trans: editForm.trans !== detailRow.csv.trans,
          comment: editForm.comment_count !== detailRow.csv.comment,
        } : { gmv: false, impression: false, viewer: false, trans: false, comment: false }

        return (
          <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeDetail}>
            <div className="bg-white rounded-3xl shadow-2xl ring-1 ring-brand-100 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 py-5 flex items-center justify-between flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 60%,#fdf2f8 100%)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-white/70 flex items-center justify-center shadow-sm flex-shrink-0">
                    <Sparkles size={16} className="text-brand-600"/>
                  </div>
                  <div>
                    <h3 className="font-bold text-brand-900 text-base">{tr('detailPerbandingan', lang)}</h3>
                    <p className="text-xs text-brand-600/80 mt-0.5">
                      {detailRow.csv.host} · {fmtDate(detailRow.csv.tanggal)} · {detailRow.csv.startSesi} · {detailRow.csv.brand}
                    </p>
                  </div>
                </div>
                <button onClick={closeDetail} className="p-2 rounded-xl hover:bg-white/60 transition-colors flex-shrink-0">
                  <X size={18} className="text-brand-400"/>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100 overflow-y-auto">
                {/* App side — editable */}
                <div className="p-6 bg-white">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-brand-100 flex items-center justify-center">
                      <Pencil size={11} className="text-brand-600"/>
                    </div>
                    <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">{tr('dataAplikasi', lang)}</p>
                    {/* The common case is "make the app match the CSV" -- without
                        this, every differing number had to be retyped by hand,
                        and saving an untouched form looked like nothing happened. */}
                    {editForm && (live.gmv || live.impression || live.viewer || live.trans || live.comment) && (
                      <button type="button"
                        onClick={() => setEditForm(f => f && ({
                          ...f,
                          gmv: detailRow.csv.gmv, impression: detailRow.csv.impression,
                          viewer: detailRow.csv.viewer, trans: detailRow.csv.trans,
                          comment_count: detailRow.csv.comment,
                        }))}
                        className="ml-auto text-[10px] font-bold text-white bg-pink-500 hover:bg-pink-600 px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors shadow-sm">
                        ← Samakan Semua dengan CSV
                      </button>
                    )}
                  </div>

                  {detailRow.app?.screenshot_url ? (
                    <button onClick={() => window.open(detailRow.app!.screenshot_url!, '_blank')} className="block w-full mb-4 group">
                      <img src={detailRow.app.screenshot_url} alt="Screenshot laporan"
                        className="w-full max-h-56 object-contain rounded-2xl border border-gray-200 group-hover:border-brand-300 group-hover:shadow-md transition-all"/>
                    </button>
                  ) : (
                    <div className="w-full h-28 rounded-2xl border border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-300 mb-4">
                      {tr('tidakAdaScreenshot', lang)}
                    </div>
                  )}

                  {editForm ? (
                    <div className="space-y-1">
                      <EditRow label={tr('host', lang)}>
                        <select value={editForm.host_id} onChange={e => setEditForm(f => f && ({ ...f, host_id: e.target.value }))}
                          className="text-xs font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 max-w-[160px]">
                          {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
                        </select>
                      </EditRow>
                      <ReadRow label={tr('date', lang)} value={fmtDate(detailRow.app!.report_date)}/>
                      <EditRow label={tr('jamMulaiCol', lang)}>
                        <div className="w-24">
                          <TimeInput value={editForm.start_time} onChange={v => setEditForm(f => f && ({ ...f, start_time: v }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                        </div>
                      </EditRow>
                      <ReadRow label={tr('durasiRow', lang)} value={detailRow.app!.duration_hours ? `${detailRow.app!.duration_hours} ${tr('durasiValue', lang)}` : '—'}/>
                      <ReadRow label={tr('brand', lang)} value={detailRow.app!.brand || '—'}/>
                      <EditRow label={tr('platform', lang)}>
                        <select value={editForm.platform} onChange={e => setEditForm(f => f && ({ ...f, platform: e.target.value }))}
                          className="text-xs font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400">
                          <option value="">—</option>
                          {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </EditRow>
                      <EditRow label={tr('gmvCol', lang)} highlight={live.gmv}
                        onUseCsv={live.gmv ? () => setEditForm(f => f && ({ ...f, gmv: detailRow.csv.gmv })) : undefined}>
                        <CurrencyInput value={editForm.gmv} onChange={v => setEditForm(f => f && ({ ...f, gmv: v }))}
                          wrapperClassName="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-brand-400 bg-white"
                          prefixClassName="px-2 py-1.5 bg-gray-50 text-[10px] font-semibold text-gray-400 flex-shrink-0"
                          className="w-24 min-w-0 px-2 py-1.5 text-xs text-right focus:outline-none"/>
                      </EditRow>
                      <EditRow label={tr('impresiCol', lang)} highlight={live.impression}
                        onUseCsv={live.impression ? () => setEditForm(f => f && ({ ...f, impression: detailRow.csv.impression })) : undefined}>
                        <input type="number" value={editForm.impression} onChange={e => setEditForm(f => f && ({ ...f, impression: Number(e.target.value) || 0 }))}
                          className="w-24 text-xs text-right font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                      </EditRow>
                      <EditRow label={tr('penontonCol', lang)} highlight={live.viewer}
                        onUseCsv={live.viewer ? () => setEditForm(f => f && ({ ...f, viewer: detailRow.csv.viewer })) : undefined}>
                        <input type="number" value={editForm.viewer} onChange={e => setEditForm(f => f && ({ ...f, viewer: Number(e.target.value) || 0 }))}
                          className="w-24 text-xs text-right font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                      </EditRow>
                      <EditRow label={tr('transCol', lang)} highlight={live.trans}
                        onUseCsv={live.trans ? () => setEditForm(f => f && ({ ...f, trans: detailRow.csv.trans })) : undefined}>
                        <input type="number" value={editForm.trans} onChange={e => setEditForm(f => f && ({ ...f, trans: Number(e.target.value) || 0 }))}
                          className="w-24 text-xs text-right font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                      </EditRow>
                      <EditRow label={tr('komentarCol', lang)} highlight={live.comment}
                        onUseCsv={live.comment ? () => setEditForm(f => f && ({ ...f, comment_count: detailRow.csv.comment })) : undefined}>
                        <input type="number" value={editForm.comment_count} onChange={e => setEditForm(f => f && ({ ...f, comment_count: Number(e.target.value) || 0 }))}
                          className="w-24 text-xs text-right font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                      </EditRow>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-300 text-center py-6">{tr('tidakAdaDataAplikasi', lang)}</p>
                  )}
                </div>

                {/* CSV side — read-only reference */}
                <div className="p-6 bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-gray-200 flex items-center justify-center">
                      <FileSpreadsheet size={11} className="text-gray-500"/>
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{tr('dataCsvLabel', lang)}</p>
                    <span className="text-[9px] bg-gray-100 text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded-full font-semibold ml-auto">{tr('referensiBadge', lang)}</span>
                  </div>
                  <div className="w-full h-28 rounded-2xl border border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-300 mb-4">
                    {tr('csvTidakMemilikiGambar', lang)}
                  </div>
                  <div className="space-y-1">
                    <ReadRow label={tr('host', lang)} value={detailRow.csv.host}/>
                    <ReadRow label={tr('date', lang)} value={fmtDate(detailRow.csv.tanggal)}/>
                    <ReadRow label={tr('jamMulaiCol', lang)} value={detailRow.csv.startSesi}/>
                    <ReadRow label={tr('durasiRow', lang)} value={`${detailRow.csv.totalJam} ${tr('durasiValue', lang)}`}/>
                    <ReadRow label={tr('brand', lang)} value={detailRow.csv.brand}/>
                    <ReadRow label={tr('platform', lang)} value={detailRow.csv.platform}/>
                    <ReadRow label={tr('gmvCol', lang)} value={formatCurrency(detailRow.csv.gmv)} highlight={live.gmv}/>
                    <ReadRow label={tr('impresiCol', lang)} value={fmtNum(detailRow.csv.impression)} highlight={live.impression}/>
                    <ReadRow label={tr('penontonCol', lang)} value={fmtNum(detailRow.csv.viewer)} highlight={live.viewer}/>
                    <ReadRow label={tr('transCol', lang)} value={fmtNum(detailRow.csv.trans)} highlight={live.trans}/>
                    <ReadRow label={tr('komentarCol', lang)} value={fmtNum(detailRow.csv.comment)} highlight={live.comment}/>
                  </div>
                </div>
              </div>

              {/* Footer */}
              {editForm && (
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0 bg-white">
                  {detailSaveError
                    ? <p className="text-xs text-red-600">{detailSaveError}</p>
                    : <p className="text-[11px] text-gray-400">{tr('perubahanDisimpanLangsung', lang)}</p>}
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={closeDetail} disabled={savingDetail}
                      className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      {tr('cancel', lang)}
                    </button>
                    {/* Not every difference means the app is wrong -- sometimes the
                        CSV is. Without this the row would stay "Berbeda" forever
                        with no way to settle it short of falsifying the report. */}
                    <button onClick={() => {
                        setAcceptedApp(prev => ({ ...prev, [detailRow.csvIdx]: new Date().toISOString() }))
                        closeDetail()
                      }} disabled={savingDetail}
                      className="px-4 py-2.5 text-sm font-semibold border border-sky-300 text-sky-700 rounded-xl hover:bg-sky-50 disabled:opacity-50 transition-colors whitespace-nowrap">
                      Data App Benar
                    </button>
                    <button onClick={saveDetailEdit} disabled={savingDetail}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-sm hover:shadow-md disabled:opacity-60 transition-all"
                      style={{ background: 'linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%)' }}>
                      <Save size={14}/> {savingDetail ? tr('saving', lang) : tr('simpanPerubahan', lang)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function ReadRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${highlight ? 'bg-pink-50' : ''}`}>
      <span className={`font-medium ${highlight ? 'text-pink-500' : 'text-gray-400'}`}>{label}</span>
      <span className={`font-semibold ${highlight ? 'text-pink-700' : 'text-gray-800'}`}>{value}</span>
    </div>
  )
}

function EditRow({ label, highlight, children, onUseCsv }: {
  label: string; highlight?: boolean; children: React.ReactNode; onUseCsv?: () => void
}) {
  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl transition-colors ${highlight ? 'bg-pink-50' : ''}`}>
      <span className={`font-medium flex-shrink-0 ${highlight ? 'text-pink-500' : 'text-gray-400'}`}>{label}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Only rendered for fields that actually differ -- the whole point of
            the popup is copying CSV over app, and before this there was no way
            to do it except retyping each number by hand. */}
        {onUseCsv && (
          <button type="button" onClick={onUseCsv} title="Pakai nilai CSV"
            className="text-[9px] font-bold text-pink-600 hover:text-white hover:bg-pink-500 border border-pink-300 rounded-md px-1.5 py-1 whitespace-nowrap transition-colors">
            ← CSV
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
