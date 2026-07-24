'use client'
import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, PLATFORM_COLORS } from '@/lib/utils'
import { Upload, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

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
  profiles: { full_name: string } | null
}

type Metric = 'gmv' | 'impression' | 'viewer' | 'trans' | 'comment'

interface CompareRow {
  csv: CsvRow
  app: AppReport | null
  mismatches: Set<Metric>
  status: 'match' | 'mismatch' | 'missing_in_app'
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
  const [hosts, setHosts] = useState<{ id: string; full_name: string }[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'mismatch' | 'missing_in_app'>('all')
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
    e.target.value = ''
    if (!parsed.length) return

    setLoading(true)
    const minDate = parsed.reduce((m, r) => r.tanggal < m ? r.tanggal : m, parsed[0].tanggal)
    const maxDate = parsed.reduce((m, r) => r.tanggal > m ? r.tanggal : m, parsed[0].tanggal)
    const supabase = createClient()
    const [reportsRes, hostsRes] = await Promise.all([
      supabase.from('live_reports')
        .select('id, report_date, host_id, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, profiles:host_id(full_name)')
        .gte('report_date', minDate).lte('report_date', maxDate),
      supabase.from('profiles').select('id, full_name').in('role', ['host', 'host_manager']),
    ])
    setAppReports((reportsRes.data as any) || [])
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

  const compareRows: CompareRow[] = useMemo(() => {
    if (!csvRows.length) return []
    const byDateHost: Record<string, AppReport[]> = {}
    appReports.forEach(r => {
      const key = `${r.report_date}|${r.host_id}`
      ;(byDateHost[key] ||= []).push(r)
    })
    return csvRows.map(csv => {
      const hostId = hostMap[csv.host.toLowerCase()] || hostMap[csv.host.split(' ')[0].toLowerCase()]
      let app: AppReport | null = null
      if (hostId) {
        const candidates = byDateHost[`${csv.tanggal}|${hostId}`] || []
        app = candidates.find(c => c.start_time?.slice(0, 5) === csv.startSesi) || (candidates.length === 1 ? candidates[0] : null)
      }
      const mismatches = new Set<Metric>()
      if (app) {
        if (Number(app.gmv) !== csv.gmv) mismatches.add('gmv')
        if (Number(app.impression) !== csv.impression) mismatches.add('impression')
        if (Number(app.viewer) !== csv.viewer) mismatches.add('viewer')
        if (Number(app.trans) !== csv.trans) mismatches.add('trans')
        if (Number(app.comment_count) !== csv.comment) mismatches.add('comment')
      }
      const status: CompareRow['status'] = !app ? 'missing_in_app' : mismatches.size > 0 ? 'mismatch' : 'match'
      return { csv, app, mismatches, status }
    })
  }, [csvRows, appReports, hostMap])

  const extraAppReports = useMemo(() => {
    const used = new Set(compareRows.filter(r => r.app).map(r => r.app!.id))
    return appReports.filter(r => !used.has(r.id))
  }, [compareRows, appReports])

  const totalMatch = compareRows.filter(r => r.status === 'match').length
  const totalMismatch = compareRows.filter(r => r.status === 'mismatch').length
  const totalMissing = compareRows.filter(r => r.status === 'missing_in_app').length

  const visibleRows = compareRows.filter(r => statusFilter === 'all' ? true : r.status === statusFilter)

  return (
    <div className="max-w-6xl mx-auto">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { key: 'all' as const, label: 'Total Baris', value: compareRows.length, icon: null, color: 'bg-gray-50 border-gray-100 text-gray-700' },
              { key: 'all' as const, label: 'Cocok', value: totalMatch, icon: CheckCircle2, color: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
              { key: 'mismatch' as const, label: 'Berbeda', value: totalMismatch, icon: AlertTriangle, color: 'bg-pink-50 border-pink-100 text-pink-700' },
              { key: 'missing_in_app' as const, label: 'Tidak Ada di App', value: totalMissing, icon: XCircle, color: 'bg-red-50 border-red-100 text-red-700' },
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

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Tanggal</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Jam</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Host</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Brand (CSV)</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Platform</th>
                    <th className="px-3 py-2.5 text-right font-semibold">GMV</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Impresi</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Penonton</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Trans</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Komentar</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleRows.map((r, idx) => (
                    <tr key={idx} className={r.status === 'missing_in_app' ? 'bg-red-50/50' : ''}>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(r.csv.tanggal)}</td>
                      <td className="px-3 py-2 text-gray-500">{r.csv.startSesi}</td>
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
                        {r.status === 'match' && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Cocok</span>}
                        {r.status === 'mismatch' && <span className="text-[10px] bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Berbeda</span>}
                        {r.status === 'missing_in_app' && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Tak Ada di App</span>}
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
    </div>
  )
}
