'use client'
import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, PLATFORM_COLORS } from '@/lib/utils'
import {
  Upload, AlertTriangle, CheckCircle2, XCircle, Link2, X, CalendarSearch, ExternalLink,
  Pencil, FileSpreadsheet, Save, Sparkles,
} from 'lucide-react'
import CurrencyInput from '@/components/CurrencyInput'
import TimeInput from '@/components/TimeInput'

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
}

function MetricCell({ csvVal, appVal, mismatch, fmt }: { csvVal: number; appVal?: number; mismatch: boolean; fmt: (n: number) => string }) {
  if (!mismatch) return <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{fmt(csvVal)}</td>
  return (
    <td className="px-3 py-2 text-right whitespace-nowrap bg-pink-50">
      <div className="text-pink-700 font-bold">{fmt(csvVal)}</div>
      <div className="text-[10px] text-pink-400">App: {appVal !== undefined ? fmt(appVal) : '—'}</div>
    </td>
  )
}

export default function RekonsiliasiTab({ profile: _profile }: { profile: any }) {
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [appReports, setAppReports] = useState<AppReport[]>([])
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotRow[]>([])
  const [hosts, setHosts] = useState<{ id: string; full_name: string; username: string | null }[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'mismatch' | 'missing_in_app' | 'not_reported_confirmed'>('all')
  // Session-only manual matches: csv row index -> app report id / schedule slot id. Resets on new upload.
  const [manualMatches, setManualMatches] = useState<Record<number, string>>({})
  const [notReportedMatches, setNotReportedMatches] = useState<Record<number, string>>({})
  const [notReportedReportIds, setNotReportedReportIds] = useState<Record<number, string>>({})
  const [savingNotReportedIdx, setSavingNotReportedIdx] = useState<number | null>(null)
  const [notReportedError, setNotReportedError] = useState('')
  const [pickingIdx, setPickingIdx] = useState<number | null>(null)
  const [pickingScheduleIdx, setPickingScheduleIdx] = useState<number | null>(null)
  const [detailRow, setDetailRow] = useState<CompareRow | null>(null)
  const [editForm, setEditForm] = useState<{
    host_id: string; start_time: string; platform: string
    gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  } | null>(null)
  const [savingDetail, setSavingDetail] = useState(false)
  const [detailSaveError, setDetailSaveError] = useState('')
  // Session-only log of rows corrected via the detail popup: csv row index -> ISO timestamp fixed.
  const [fixedLog, setFixedLog] = useState<Record<number, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

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
    setFixedLog({})
    e.target.value = ''
    if (!parsed.length) return

    setLoading(true)
    const minDate = parsed.reduce((m, r) => r.tanggal < m ? r.tanggal : m, parsed[0].tanggal)
    const maxDate = parsed.reduce((m, r) => r.tanggal > m ? r.tanggal : m, parsed[0].tanggal)
    // Widen by a day on each side so midnight-crossing sessions can still be found.
    const fetchStart = shiftDate(minDate, -1)
    const fetchEnd = shiftDate(maxDate, 1)
    const supabase = createClient()
    const [reportsRes, slotsRes, hostsRes] = await Promise.all([
      supabase.from('live_reports')
        .select('id, report_date, host_id, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, screenshot_url, profiles:host_id(full_name, username)')
        .gte('report_date', fetchStart).lte('report_date', fetchEnd),
      supabase.from('schedule_slots')
        .select('id, slot_date, session_no, jam_mulai, durasi, brand, platform, host_id')
        .gte('slot_date', fetchStart).lte('slot_date', fetchEnd).not('host_id', 'is', null),
      supabase.from('profiles').select('id, full_name, username').in('role', ['host', 'host_manager']),
    ])
    setAppReports((reportsRes.data as any) || [])
    setScheduleSlots((slotsRes.data as any) || [])
    setHosts(hostsRes.data || [])
    setLoading(false)
  }

  const hostMap = useMemo(() => {
    const map: Record<string, string> = {}
    hosts.forEach(h => {
      map[h.full_name.toLowerCase()] = h.id
      const first = h.full_name.split(' ')[0].toLowerCase()
      if (!map[first]) map[first] = h.id
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
      }
      return { csv, csvIdx, app, mismatches, status, isManual, notReportedSlot }
    })
  }, [csvRows, appReports, hostMap, manualMatches, appById, notReportedMatches, scheduleById])

  const usedAppIds = useMemo(() => new Set(compareRows.filter(r => r.app).map(r => r.app!.id)), [compareRows])

  const extraAppReports = useMemo(() =>
    appReports.filter(r => !usedAppIds.has(r.id)).sort((a, b) => a.report_date.localeCompare(b.report_date)),
    [appReports, usedAppIds])

  // Candidates offered in the manual-match picker for a given CSV row: only
  // yesterday/today/tomorrow relative to the CSV row's date (sessions that
  // cross midnight can land on the day before/after), same date sorted first.
  function candidatesFor(csv: CsvRow) {
    const prev = shiftDate(csv.tanggal, -1)
    const next = shiftDate(csv.tanggal, 1)
    return extraAppReports
      .filter(r => r.report_date === prev || r.report_date === csv.tanggal || r.report_date === next)
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
  // reports) in the ±1 day window, same host if resolved, same brand if any
  // slot in that window actually matches the brand (otherwise brand isn't
  // used as a filter, since CSV/app brand spelling often differs).
  function scheduleCandidatesFor(csv: CsvRow) {
    const prev = shiftDate(csv.tanggal, -1)
    const next = shiftDate(csv.tanggal, 1)
    const hostId = hostMap[csv.host.toLowerCase()] || hostMap[csv.host.split(' ')[0].toLowerCase()]
    const base = scheduleSlots
      .filter(s => s.slot_date === prev || s.slot_date === csv.tanggal || s.slot_date === next)
      .filter(s => !hostId || s.host_id === hostId)
    const withBrand = base.filter(s => brandsMatch(s.brand || '', csv.brand))
    const pool = withBrand.length > 0 ? withBrand : base
    return pool.sort((a, b) => {
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
    }).select('id, report_date, host_id, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, screenshot_url, profiles:host_id(full_name, username)').single()
    setSavingNotReportedIdx(null)
    if (error) { setNotReportedError(error.message); return }
    if (data) {
      setAppReports(prev => [...prev, data as any])
      setNotReportedMatches(prev => ({ ...prev, [csvIdx]: slotId }))
      setNotReportedReportIds(prev => ({ ...prev, [csvIdx]: (data as any).id }))
      setPickingScheduleIdx(null)
    }
  }

  async function clearNotReportedMatch(csvIdx: number) {
    const reportId = notReportedReportIds[csvIdx]
    if (reportId) {
      await createClient().from('live_reports').delete().eq('id', reportId)
      setAppReports(prev => prev.filter(a => a.id !== reportId))
    }
    setNotReportedMatches(prev => { const n = { ...prev }; delete n[csvIdx]; return n })
    setNotReportedReportIds(prev => { const n = { ...prev }; delete n[csvIdx]; return n })
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
    setSavingDetail(true); setDetailSaveError('')
    const supabase = createClient()
    const { data, error } = await supabase.from('live_reports').update({
      host_id: editForm.host_id,
      start_time: editForm.start_time || null,
      platform: editForm.platform || null,
      gmv: editForm.gmv, impression: editForm.impression, viewer: editForm.viewer,
      trans: editForm.trans, comment_count: editForm.comment_count,
    }).eq('id', detailRow.app.id)
      .select('id, report_date, host_id, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, screenshot_url, profiles:host_id(full_name, username)')
      .single()
    setSavingDetail(false)
    if (error) { setDetailSaveError(error.message); return }
    if (data) {
      setAppReports(prev => prev.map(a => a.id === (data as any).id ? (data as any) : a))
      setFixedLog(prev => ({ ...prev, [detailRow.csvIdx]: new Date().toISOString() }))
      closeDetail()
    }
  }

  return (
    <div className="w-full">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <p className="text-sm font-bold text-gray-900 mb-1">Upload CSV Rekonsiliasi</p>
        <p className="text-xs text-gray-500 mb-3">
          Upload data live bulanan (Tanggal, Brand, Room, Start Sesi, Total Jam, Host, Platform, GMV, Impression, Viewer, Trans, Comment).
          Setiap baris akan dicocokkan dengan laporan live host di aplikasi berdasarkan tanggal, host, dan jam mulai.
        </p>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile}/>
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3.5 py-2 rounded-xl font-medium hover:bg-brand-700 transition-colors shadow-sm">
          <Upload size={14}/> Pilih File CSV
        </button>
        {fileName && <p className="text-xs text-gray-400 mt-2">{loading ? 'Memuat...' : `File: ${fileName} · ${csvRows.length} baris`}</p>}
      </div>

      {csvRows.length > 0 && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            {[
              { key: 'all' as const, label: 'Total Baris', value: compareRows.length, icon: null, color: 'bg-gray-50 border-gray-100 text-gray-700' },
              { key: 'all' as const, label: 'Cocok', value: totalMatch, icon: CheckCircle2, color: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
              { key: 'mismatch' as const, label: 'Berbeda', value: totalMismatch, icon: AlertTriangle, color: 'bg-pink-50 border-pink-100 text-pink-700' },
              { key: 'missing_in_app' as const, label: 'Tidak Ada di App', value: totalMissing, icon: XCircle, color: 'bg-red-50 border-red-100 text-red-700' },
              { key: 'not_reported_confirmed' as const, label: 'Tidak Lapor (CSV)', value: totalNotReported, icon: CalendarSearch, color: 'bg-purple-50 border-purple-100 text-purple-700' },
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
              <p className="text-xs text-red-600">Gagal menyimpan: {notReportedError}</p>
              <button onClick={() => setNotReportedError('')} className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={14}/></button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Tanggal</th>
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Jam Mulai</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Host</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Brand (CSV)</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Platform</th>
                    <th className="px-3 py-2.5 text-right font-semibold">GMV</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Impresi</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Penonton</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Trans</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Komentar</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Status</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleRows.map((r, idx) => (
                    <tr key={idx} className={r.status === 'missing_in_app' ? 'bg-red-50/50' : r.status === 'not_reported_confirmed' ? 'bg-purple-50/40' : ''}>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(r.csv.tanggal)}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-lg">{r.csv.startSesi}</span></td>
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{r.csv.host}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate">{r.csv.brand}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${PLATFORM_COLORS[r.csv.platform] || PLATFORM_COLORS.Other}`}>
                          {r.csv.platform}
                        </span>
                      </td>
                      <MetricCell csvVal={r.csv.gmv} appVal={r.app ? Number(r.app.gmv) : undefined} mismatch={r.mismatches.has('gmv')} fmt={formatCurrency}/>
                      <MetricCell csvVal={r.csv.impression} appVal={r.app ? Number(r.app.impression) : undefined} mismatch={r.mismatches.has('impression')} fmt={fmtNum}/>
                      <MetricCell csvVal={r.csv.viewer} appVal={r.app ? Number(r.app.viewer) : undefined} mismatch={r.mismatches.has('viewer')} fmt={fmtNum}/>
                      <MetricCell csvVal={r.csv.trans} appVal={r.app ? Number(r.app.trans) : undefined} mismatch={r.mismatches.has('trans')} fmt={fmtNum}/>
                      <MetricCell csvVal={r.csv.comment} appVal={r.app ? Number(r.app.comment_count) : undefined} mismatch={r.mismatches.has('comment')} fmt={fmtNum}/>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {r.status === 'match' && (
                            fixedLog[r.csvIdx] ? (
                              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                                Fixed · {fmtFixedDate(fixedLog[r.csvIdx])}
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Cocok</span>
                            )
                          )}
                          {r.status === 'mismatch' && <span className="text-[10px] bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Berbeda</span>}
                          {r.status === 'missing_in_app' && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Tak Ada di App</span>}
                          {r.status === 'not_reported_confirmed' && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Tidak Lapor (CSV)</span>}
                          {r.isManual && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Manual</span>}
                        </div>
                        {r.status === 'not_reported_confirmed' && (
                          <p className="text-[9px] text-purple-400 italic mt-0.5">CSV</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.isManual ? (
                          <button onClick={() => clearManualMatch(r.csvIdx)}
                            className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg px-2 py-1 transition-colors">
                            <X size={10}/> Batalkan
                          </button>
                        ) : r.status === 'not_reported_confirmed' ? (
                          <button onClick={() => clearNotReportedMatch(r.csvIdx)}
                            className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg px-2 py-1 transition-colors">
                            <X size={10}/> Batalkan
                          </button>
                        ) : r.status === 'missing_in_app' ? (
                          pickingIdx === r.csvIdx ? (
                            <select autoFocus defaultValue=""
                              onChange={e => { if (e.target.value) setManualMatch(r.csvIdx, e.target.value) }}
                              onBlur={() => setPickingIdx(null)}
                              className="text-[10px] border border-brand-300 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white max-w-[280px]">
                              <option value="">— Pilih laporan app —</option>
                              {candidatesFor(r.csv).map(c => {
                                const p = c.profiles as any
                                const nick = p?.username || p?.full_name?.split(' ')[0] || '—'
                                return (
                                  <option key={c.id} value={c.id}>
                                    {fmtDate(c.report_date)} · {c.start_time?.slice(0,5) || '—'} · {nick} · {c.brand || '—'} · {formatCurrency(Number(c.gmv))}
                                  </option>
                                )
                              })}
                            </select>
                          ) : savingNotReportedIdx === r.csvIdx ? (
                            <span className="text-[10px] text-purple-500 whitespace-nowrap">Menyimpan...</span>
                          ) : pickingScheduleIdx === r.csvIdx ? (
                            <select autoFocus defaultValue=""
                              onChange={e => { if (e.target.value) setNotReportedMatch(r.csvIdx, e.target.value) }}
                              onBlur={() => setPickingScheduleIdx(null)}
                              className="text-[10px] border border-purple-300 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white max-w-[280px]">
                              <option value="">— Pilih jadwal —</option>
                              {scheduleCandidatesFor(r.csv).map(s => (
                                <option key={s.id} value={s.id}>
                                  {fmtDate(s.slot_date)} · {slotTime(s)} · {hostNameById[s.host_id] || '—'} · {s.brand || '—'}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setPickingIdx(r.csvIdx)}
                                className="inline-flex items-center gap-1 text-[10px] text-brand-600 hover:text-brand-800 border border-brand-200 rounded-lg px-2 py-1 hover:bg-brand-50 transition-colors whitespace-nowrap">
                                <Link2 size={10}/> Match Manual
                              </button>
                              <button onClick={() => setPickingScheduleIdx(r.csvIdx)}
                                className="inline-flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-800 border border-purple-200 rounded-lg px-2 py-1 hover:bg-purple-50 transition-colors whitespace-nowrap">
                                <CalendarSearch size={10}/> Tidak Lapor
                              </button>
                            </div>
                          )
                        ) : r.status === 'mismatch' ? (
                          <button onClick={() => openDetail(r)}
                            className="inline-flex items-center gap-1 text-[10px] text-pink-600 hover:text-pink-800 border border-pink-200 rounded-lg px-2 py-1 hover:bg-pink-50 transition-colors whitespace-nowrap">
                            <ExternalLink size={10}/> Detail
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
                {extraAppReports.length} laporan di App tidak ditemukan di CSV (host melapor, tapi tidak ada di file rekonsiliasi)
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
                    <h3 className="font-bold text-brand-900 text-base">Detail Perbandingan</h3>
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
                    <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">Data Aplikasi</p>
                    <span className="text-[9px] bg-brand-50 text-brand-500 border border-brand-100 px-1.5 py-0.5 rounded-full font-semibold ml-auto">Bisa Diedit</span>
                  </div>

                  {detailRow.app?.screenshot_url ? (
                    <button onClick={() => window.open(detailRow.app!.screenshot_url!, '_blank')} className="block w-full mb-4 group">
                      <img src={detailRow.app.screenshot_url} alt="Screenshot laporan"
                        className="w-full max-h-56 object-contain rounded-2xl border border-gray-200 group-hover:border-brand-300 group-hover:shadow-md transition-all"/>
                    </button>
                  ) : (
                    <div className="w-full h-28 rounded-2xl border border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-300 mb-4">
                      Tidak ada screenshot
                    </div>
                  )}

                  {editForm ? (
                    <div className="space-y-1">
                      <EditRow label="Host">
                        <select value={editForm.host_id} onChange={e => setEditForm(f => f && ({ ...f, host_id: e.target.value }))}
                          className="text-xs font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 max-w-[160px]">
                          {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
                        </select>
                      </EditRow>
                      <ReadRow label="Tanggal" value={fmtDate(detailRow.app!.report_date)}/>
                      <EditRow label="Jam">
                        <div className="w-24">
                          <TimeInput value={editForm.start_time} onChange={v => setEditForm(f => f && ({ ...f, start_time: v }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                        </div>
                      </EditRow>
                      <ReadRow label="Durasi" value={detailRow.app!.duration_hours ? `${detailRow.app!.duration_hours} jam` : '—'}/>
                      <ReadRow label="Brand" value={detailRow.app!.brand || '—'}/>
                      <EditRow label="Platform">
                        <select value={editForm.platform} onChange={e => setEditForm(f => f && ({ ...f, platform: e.target.value }))}
                          className="text-xs font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400">
                          <option value="">—</option>
                          {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </EditRow>
                      <EditRow label="GMV" highlight={live.gmv}>
                        <CurrencyInput value={editForm.gmv} onChange={v => setEditForm(f => f && ({ ...f, gmv: v }))}
                          wrapperClassName="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-brand-400 bg-white"
                          prefixClassName="px-2 py-1.5 bg-gray-50 text-[10px] font-semibold text-gray-400 flex-shrink-0"
                          className="w-24 min-w-0 px-2 py-1.5 text-xs text-right focus:outline-none"/>
                      </EditRow>
                      <EditRow label="Impresi" highlight={live.impression}>
                        <input type="number" value={editForm.impression} onChange={e => setEditForm(f => f && ({ ...f, impression: Number(e.target.value) || 0 }))}
                          className="w-24 text-xs text-right font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                      </EditRow>
                      <EditRow label="Penonton" highlight={live.viewer}>
                        <input type="number" value={editForm.viewer} onChange={e => setEditForm(f => f && ({ ...f, viewer: Number(e.target.value) || 0 }))}
                          className="w-24 text-xs text-right font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                      </EditRow>
                      <EditRow label="Trans" highlight={live.trans}>
                        <input type="number" value={editForm.trans} onChange={e => setEditForm(f => f && ({ ...f, trans: Number(e.target.value) || 0 }))}
                          className="w-24 text-xs text-right font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                      </EditRow>
                      <EditRow label="Komentar" highlight={live.comment}>
                        <input type="number" value={editForm.comment_count} onChange={e => setEditForm(f => f && ({ ...f, comment_count: Number(e.target.value) || 0 }))}
                          className="w-24 text-xs text-right font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                      </EditRow>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-300 text-center py-6">Tidak ada data aplikasi</p>
                  )}
                </div>

                {/* CSV side — read-only reference */}
                <div className="p-6 bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-gray-200 flex items-center justify-center">
                      <FileSpreadsheet size={11} className="text-gray-500"/>
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Data CSV</p>
                    <span className="text-[9px] bg-gray-100 text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded-full font-semibold ml-auto">Referensi</span>
                  </div>
                  <div className="w-full h-28 rounded-2xl border border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-300 mb-4">
                    CSV tidak memiliki gambar
                  </div>
                  <div className="space-y-1">
                    <ReadRow label="Host" value={detailRow.csv.host}/>
                    <ReadRow label="Tanggal" value={fmtDate(detailRow.csv.tanggal)}/>
                    <ReadRow label="Jam" value={detailRow.csv.startSesi}/>
                    <ReadRow label="Durasi" value={`${detailRow.csv.totalJam} jam`}/>
                    <ReadRow label="Brand" value={detailRow.csv.brand}/>
                    <ReadRow label="Platform" value={detailRow.csv.platform}/>
                    <ReadRow label="GMV" value={formatCurrency(detailRow.csv.gmv)} highlight={live.gmv}/>
                    <ReadRow label="Impresi" value={fmtNum(detailRow.csv.impression)} highlight={live.impression}/>
                    <ReadRow label="Penonton" value={fmtNum(detailRow.csv.viewer)} highlight={live.viewer}/>
                    <ReadRow label="Trans" value={fmtNum(detailRow.csv.trans)} highlight={live.trans}/>
                    <ReadRow label="Komentar" value={fmtNum(detailRow.csv.comment)} highlight={live.comment}/>
                  </div>
                </div>
              </div>

              {/* Footer */}
              {editForm && (
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0 bg-white">
                  {detailSaveError
                    ? <p className="text-xs text-red-600">{detailSaveError}</p>
                    : <p className="text-[11px] text-gray-400">Perubahan disimpan langsung ke laporan live host.</p>}
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={closeDetail} disabled={savingDetail}
                      className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      Batal
                    </button>
                    <button onClick={saveDetailEdit} disabled={savingDetail}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-sm hover:shadow-md disabled:opacity-60 transition-all"
                      style={{ background: 'linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%)' }}>
                      <Save size={14}/> {savingDetail ? 'Menyimpan...' : 'Simpan Perubahan'}
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

function EditRow({ label, highlight, children }: { label: string; highlight?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-xl transition-colors ${highlight ? 'bg-pink-50' : ''}`}>
      <span className={`font-medium flex-shrink-0 ${highlight ? 'text-pink-500' : 'text-gray-400'}`}>{label}</span>
      {children}
    </div>
  )
}
