'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PLATFORM_COLORS } from '@/lib/utils'
import {
  Filter, Download, Package, TrendingUp, FileText,
  ChevronDown, ChevronUp, Pencil, Trash2, X, Save, Plus, Upload, AlertCircle,
} from 'lucide-react'

interface ReportRow {
  id: string; report_date: string; brand: string | null; platform: string | null
  start_time: string | null; duration_hours: number | null
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  screenshot_url: string | null; notes: string | null; product_sold_name: string | null
  host_id: string; profiles: { full_name: string } | null
}
interface ProductRow {
  id: string; live_report_id: string; produk_terjual: string
  product_klik: number; item_sold: number; total: number
}
interface Host { id: string; full_name: string }

// CSV preview row (before import)
interface CsvRow {
  _line: number; _error?: string
  report_date: string; host_id: string; host_name: string; brand: string; platform: string
  start_time: string; duration_hours: number
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  product_sold_name: string; notes: string
}

const PLATFORMS = ['Shopee', 'TikTok', 'Instagram', 'YouTube', 'Other']

function getMonthOptions() {
  const months = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    const y = d.getFullYear(); const m = d.getMonth()
    months.push({
      label: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
      start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end: `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`,
    })
  }
  return months
}

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0)
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return (n || 0).toString()
}
function localDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const MONTH_ID: Record<string, number> = {
  jan:1,feb:2,mar:3,apr:4,may:5,mei:5,jun:6,jul:7,aug:8,agu:8,sep:9,oct:10,okt:10,nov:11,dec:12,des:12,
}

// Parse many date formats → YYYY-MM-DD
// Supports: YYYY-MM-DD | DD/MM/YYYY | 21-Jun-2026 | 21 Jun 2026
function parseDate(s: string): string {
  s = s.trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/').map(Number)
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }
  // 21-Jun-2026 or 21 Jun 2026
  const m3 = s.match(/^(\d{1,2})[-\s]([a-zA-Z]{3,})[-\s](\d{4})$/)
  if (m3) {
    const mo = MONTH_ID[m3[2].toLowerCase().slice(0,3)]
    if (mo) return `${m3[3]}-${String(mo).padStart(2,'0')}-${String(m3[1]).padStart(2,'0')}`
  }
  return ''
}

// Parse "13.00" or "13:00" → "13:00"
function parseTime(s: string): string {
  s = s.trim()
  if (!s) return ''
  const m = s.match(/^(\d{1,2})[.:](\d{2})$/)
  if (m) return `${String(m[1]).padStart(2,'0')}:${m[2]}`
  return s
}

// Strip "Rp" prefix and dots used as Indonesian thousands separator → integer
function parseRp(s: string): number {
  if (!s || !s.trim()) return 0
  const clean = s.replace(/Rp/gi,'').replace(/\./g,'').replace(/,/g,'').replace(/\s/g,'')
  return parseInt(clean, 10) || 0
}

// Parse numbers that may use dots as thousands separator: "7.430" → 7430
function parseNum(s: string): number {
  if (!s || !s.trim()) return 0
  // If it contains a dot but no comma it's likely thousands-separator style
  const clean = s.replace(/\./g,'').replace(/,/g,'').trim()
  return parseInt(clean, 10) || 0
}

// Normalize platform name
function normalizePlatform(s: string): string {
  const map: Record<string,string> = { tiktok:'TikTok', shopee:'Shopee', instagram:'Instagram', youtube:'YouTube', other:'Other' }
  return map[s.toLowerCase().trim()] || s.trim()
}

// Parse CSV text → headers + rows (supports comma and semicolon delimiters)
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const splitLine = (l: string) => l.split(/[,;]/).map(c => c.trim().replace(/^"|"$/g,''))
  return { headers: splitLine(lines[0]), rows: lines.slice(1).map(splitLine) }
}

const EMPTY_FORM = {
  report_date: new Date().toISOString().slice(0, 10),
  host_id: '', brand: '', platform: '', start_time: '',
  duration_hours: 0, gmv: 0, impression: 0, viewer: 0, trans: 0, comment_count: 0,
  product_sold_name: '', notes: '',
}

export default function ReportDetailTab({ profile }: { profile: any }) {
  const isSuperadmin = profile?.role === 'superadmin'

  const [reports, setReports] = useState<ReportRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [monthIdx, setMonthIdx] = useState(0)
  const [selectedHost, setSelectedHost] = useState('')
  const [selectedBrand, setSelectedBrand] = useState('')

  // Add / Edit state
  const [modalMode, setModalMode] = useState<'none' | 'add' | 'edit'>('none')
  const [editRow, setEditRow] = useState<ReportRow | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // CSV import state
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvSelected, setCsvSelected] = useState<Set<number>>(new Set())
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; fail: number } | null>(null)
  const csvRef = useRef<HTMLInputElement>(null)

  const monthOptions = getMonthOptions()
  const month = monthOptions[monthIdx]

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'host').eq('is_active', true).order('full_name'),
      supabase.from('profiles').select('client_brand').eq('role', 'client').not('client_brand', 'is', null),
    ]).then(([h, c]) => {
      setHosts(h.data || [])
      setBrands(Array.from(new Set((c.data || []).map((x: any) => x.client_brand).filter(Boolean))).sort() as string[])
    })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setExpanded({})
    const supabase = createClient()
    let q = supabase.from('live_reports')
      .select('id, report_date, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, screenshot_url, notes, product_sold_name, host_id, profiles:host_id(full_name)')
      .gte('report_date', month.start).lte('report_date', month.end)
      .order('report_date', { ascending: false }).order('start_time', { ascending: false })
    if (selectedHost) q = q.eq('host_id', selectedHost)
    if (selectedBrand) q = q.eq('brand', selectedBrand)

    const { data: reps } = await q
    const rows = (reps as unknown as ReportRow[]) || []
    setReports(rows)

    const ids = rows.map(r => r.id)
    if (ids.length) {
      const { data: prods } = await supabase.from('live_report_products')
        .select('id, live_report_id, produk_terjual, product_klik, item_sold, total')
        .in('live_report_id', ids)
      setProducts((prods as ProductRow[]) || [])
    } else setProducts([])
    setLoading(false)
  }, [month.start, month.end, selectedHost, selectedBrand])

  useEffect(() => { fetchData() }, [fetchData])

  const productsByReport: Record<string, ProductRow[]> = {}
  products.forEach(p => {
    if (!productsByReport[p.live_report_id]) productsByReport[p.live_report_id] = []
    productsByReport[p.live_report_id].push(p)
  })

  const totalGmv = reports.reduce((s, r) => s + (r.gmv || 0), 0)

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  function openAdd() {
    setForm({ ...EMPTY_FORM })
    setEditRow(null); setFormError(''); setModalMode('add')
  }
  function openEdit(r: ReportRow, e: React.MouseEvent) {
    e.stopPropagation()
    setEditRow(r)
    setForm({
      report_date: r.report_date, host_id: r.host_id, brand: r.brand || '',
      platform: r.platform || '', start_time: r.start_time || '',
      duration_hours: r.duration_hours || 0, gmv: r.gmv || 0,
      impression: r.impression || 0, viewer: r.viewer || 0,
      trans: r.trans || 0, comment_count: r.comment_count || 0,
      product_sold_name: r.product_sold_name || '', notes: r.notes || '',
    })
    setFormError(''); setModalMode('edit')
  }
  function closeModal() { setModalMode('none'); setEditRow(null) }

  async function saveForm() {
    if (!form.brand.trim()) { setFormError('Brand wajib diisi'); return }
    setSaving(true); setFormError('')
    const supabase = createClient()
    const payload = {
      report_date: form.report_date,
      host_id: form.host_id || null,
      brand: form.brand || null,
      platform: form.platform || null,
      start_time: form.start_time || null,
      duration_hours: Number(form.duration_hours) || null,
      gmv: Number(form.gmv) || 0,
      impression: Number(form.impression) || 0,
      viewer: Number(form.viewer) || 0,
      trans: Number(form.trans) || 0,
      comment_count: Number(form.comment_count) || 0,
      product_sold_name: form.product_sold_name || null,
      notes: form.notes || null,
    }
    if (modalMode === 'add') {
      const { error } = await supabase.from('live_reports').insert(payload)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else if (editRow) {
      const { error } = await supabase.from('live_reports').update(payload).eq('id', editRow.id)
      if (error) { setFormError(error.message); setSaving(false); return }
    }
    setSaving(false); closeModal(); fetchData()
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    await createClient().from('live_reports').delete().eq('id', id)
    setReports(prev => prev.filter(r => r.id !== id))
    setConfirmDeleteId(null); setDeleting(false)
  }

  // ── CSV import ────────────────────────────────────────────────────────────────
  function downloadTemplate() {
    const header = 'tanggal,host,brand,platform,jam_mulai,durasi_jam,gmv,impresi,penonton,transaksi,komentar,produk_terjual,evaluasi'
    const example = '28/06/2026,Koko,Saga Beauty - Nivea,TikTok,09:00,4,1500000,12000,800,35,120,Serum Wajah,Bagus traffic-nya'
    const blob = new Blob([header + '\n' + example], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'template_import_live_report.csv'; a.click()
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const { headers, rows } = parseCsv(text)

      // Map header names (case-insensitive) → canonical field keys
      // Supports both the NW template names AND the user's existing spreadsheet columns
      const alias: Record<string, string> = {
        // NW template names
        tanggal: 'report_date', host: 'host_name', brand: 'brand', platform: 'platform',
        jam_mulai: 'start_time', durasi_jam: 'duration_hours',
        gmv: 'gmv', impresi: 'impression', penonton: 'viewer',
        transaksi: 'trans', komentar: 'comment_count',
        produk_terjual: 'product_sold_name', evaluasi: 'notes',
        // Their spreadsheet column names
        'start sesi': 'start_time',
        'total jam': 'duration_hours',
        impression: 'impression',
        viewer: 'viewer',
        trans: 'trans',
        comment: 'comment_count',
        // ignored: bulan, cabang, tipe live, room
      }
      const colMap: Record<number, string> = {}
      headers.forEach((h, i) => {
        const key = alias[h.toLowerCase().trim()]
        if (key) colMap[i] = key
      })

      // Build host lookup: try full name, then first name only
      const hostMap: Record<string, string> = {}
      hosts.forEach(h => {
        hostMap[h.full_name.toLowerCase()] = h.id
        // also index by first name alone for short-name CSVs
        const first = h.full_name.split(' ')[0].toLowerCase()
        if (!hostMap[first]) hostMap[first] = h.id
      })

      const parsed: CsvRow[] = rows.map((row, li) => {
        const obj: Record<string, string> = {}
        Object.entries(colMap).forEach(([ci, key]) => { obj[key] = (row[Number(ci)] || '').trim() })

        const dateStr = parseDate(obj.report_date || '')
        const hostName = obj.host_name || ''
        // Try full name first, then first-name match
        const hostId = hostMap[hostName.toLowerCase()] || hostMap[hostName.split(' ')[0].toLowerCase()] || ''
        const platform = normalizePlatform(obj.platform || '')
        const startTime = parseTime(obj.start_time || '')

        const errors: string[] = []
        if (!dateStr) errors.push('tanggal tidak valid')
        if (!obj.brand) errors.push('brand kosong')

        return {
          _line: li + 2,
          _error: errors.length ? errors.join('; ') : undefined,
          report_date: dateStr,
          host_id: hostId, host_name: hostName,
          brand: obj.brand || '',
          platform,
          start_time: startTime,
          duration_hours: parseFloat(obj.duration_hours || '0') || 0,
          gmv: parseRp(obj.gmv || '0'),
          impression: parseNum(obj.impression || '0'),
          viewer: parseNum(obj.viewer || '0'),
          trans: parseNum(obj.trans || '0'),
          comment_count: parseNum(obj.comment_count || '0'),
          product_sold_name: obj.product_sold_name || '',
          notes: obj.notes || '',
        }
      })

      setCsvRows(parsed)
      const validLines = new Set(parsed.filter(r => !r._error).map((_, i) => i))
      setCsvSelected(validLines)
      setImportResult(null)
      setShowCsvModal(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function runImport() {
    const toInsert = csvRows.filter((_, i) => csvSelected.has(i)).map(r => ({
      report_date: r.report_date, host_id: r.host_id || null, brand: r.brand,
      platform: r.platform || null, start_time: r.start_time || null,
      duration_hours: r.duration_hours || null, gmv: r.gmv, impression: r.impression,
      viewer: r.viewer, trans: r.trans, comment_count: r.comment_count,
      product_sold_name: r.product_sold_name || null, notes: r.notes || null,
    }))
    if (!toInsert.length) return
    setImporting(true)
    const { data, error } = await createClient().from('live_reports').insert(toInsert).select('id')
    setImporting(false)
    setImportResult({ ok: data?.length || 0, fail: error ? toInsert.length : 0 })
    if (!error) { fetchData() }
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  async function exportExcel() {
    const { utils, writeFile } = await import('xlsx')
    const ws = utils.json_to_sheet(reports.map(r => ({
      'Tanggal': r.report_date,
      'Host': r.profiles?.full_name || '',
      'Brand': r.brand || '',
      'Platform': r.platform || '',
      'Jam Mulai': r.start_time || '',
      'Durasi (jam)': r.duration_hours || 0,
      'GMV': r.gmv || 0,
      'Impresi': r.impression || 0,
      'Penonton': r.viewer || 0,
      'Transaksi': r.trans || 0,
      'Komentar': r.comment_count || 0,
      'Produk Dijual': r.product_sold_name || '',
      'Evaluasi': r.notes || '',
    })))
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Live Reports')
    const prodRows = reports.flatMap(r =>
      (productsByReport[r.id] || []).map(p => ({
        'Tanggal': r.report_date, 'Host': r.profiles?.full_name || '',
        'Brand': r.brand || '', 'Produk': p.produk_terjual,
        'Klik': p.product_klik, 'Terjual': p.item_sold, 'Total': p.total,
      }))
    )
    if (prodRows.length) utils.book_append_sheet(wb, utils.json_to_sheet(prodRows), 'Produk Terjual')
    const parts = ['LiveReport', month.label.replace(/\s+/g, '-')]
    if (selectedHost) parts.push(hosts.find(h => h.id === selectedHost)?.full_name.replace(/\s+/g, '') || '')
    if (selectedBrand) parts.push(selectedBrand.replace(/\s+/g, ''))
    writeFile(wb, `${parts.filter(Boolean).join('_')}.xlsx`)
  }

  // ── Form field helper ─────────────────────────────────────────────────────────
  const ff = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto">
      {/* Hidden file input for CSV */}
      <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvFile}/>

      {/* Filters row */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400"/>
          <span className="text-xs text-gray-500 font-medium">Filter:</span>
        </div>
        <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
          {monthOptions.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
        </select>
        <select value={selectedHost} onChange={e => setSelectedHost(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white min-w-[150px]">
          <option value="">Semua Host</option>
          {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
        </select>
        <select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white min-w-[150px]">
          <option value="">Semua Brand</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {isSuperadmin && (
            <>
              <button onClick={openAdd}
                className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3.5 py-2 rounded-xl font-semibold hover:bg-brand-700 transition-colors shadow-sm">
                <Plus size={14}/> Tambah Manual
              </button>
              <button onClick={() => csvRef.current?.click()}
                className="flex items-center gap-1.5 text-sm bg-emerald-600 text-white px-3.5 py-2 rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-sm">
                <Upload size={14}/> Import CSV
              </button>
            </>
          )}
          <button onClick={exportExcel} disabled={reports.length === 0}
            className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 px-3.5 py-2 rounded-xl font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Download size={14}/> Unduh Excel
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total Laporan', value: String(reports.length), color: 'bg-brand-50 border-brand-100 text-brand-700', icon: FileText },
          { label: 'Total GMV', value: fmtRp(totalGmv), color: 'bg-emerald-50 border-emerald-100 text-emerald-700', icon: TrendingUp },
          { label: selectedHost ? '1 Host' : `${hosts.length} Host`, value: '', color: 'bg-blue-50 border-blue-100 text-blue-700', icon: Package },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`rounded-2xl border p-4 flex items-center gap-3 ${color}`}>
            <Icon size={18} className="flex-shrink-0 opacity-70"/>
            <div>
              <p className="text-xs opacity-70 font-medium">{label}</p>
              {value && <p className="text-lg font-bold leading-tight">{value}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">Memuat...</div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          Tidak ada laporan untuk filter ini
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Tanggal</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Host</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Brand</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Platform</th>
                  <th className="px-3 py-2.5 text-right font-semibold">GMV</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Impresi</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Penonton</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Komentar</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Produk Terjual</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Evaluasi</th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reports.map(r => {
                  const prods = productsByReport[r.id] || []
                  const isOpen = expanded[r.id]
                  const isConfirm = confirmDeleteId === r.id
                  return (
                    <>
                      <tr key={r.id} onClick={() => setExpanded(p => ({ ...p, [r.id]: !p[r.id] }))}
                        className="hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">{localDate(r.report_date)}</td>
                        <td className="px-3 py-3 font-semibold text-brand-700 text-xs whitespace-nowrap">
                          {(r.profiles as any)?.full_name || '—'}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-700 font-medium whitespace-nowrap">{r.brand || '—'}</td>
                        <td className="px-3 py-3">
                          {r.platform && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${PLATFORM_COLORS[r.platform] || PLATFORM_COLORS.Other}`}>
                              {r.platform}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-700 text-xs whitespace-nowrap">{fmtRp(r.gmv)}</td>
                        <td className="px-3 py-3 text-right text-xs text-gray-600">{fmtNum(r.impression)}</td>
                        <td className="px-3 py-3 text-right text-xs text-gray-600">{fmtNum(r.viewer)}</td>
                        <td className="px-3 py-3 text-right text-xs text-gray-600">{r.comment_count || 0}</td>
                        <td className="px-3 py-3 text-xs text-gray-700 max-w-[140px] truncate">
                          {r.product_sold_name || (prods.length > 0 ? `${prods.length} produk` : '—')}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 max-w-[160px] truncate">{r.notes || '—'}</td>
                        <td className="px-3 py-3 text-gray-400">
                          {isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${r.id}-detail`}>
                          <td colSpan={11} className="bg-gray-50 px-4 py-4 border-b border-gray-100">
                            <div className="flex gap-6 flex-wrap">
                              {r.screenshot_url && (
                                <div className="flex-shrink-0">
                                  <button onClick={e => { e.stopPropagation(); window.open(r.screenshot_url!, '_blank') }}>
                                    <img src={r.screenshot_url} alt="SS"
                                      className="w-28 h-20 rounded-xl object-cover border-2 border-brand-200 shadow-sm hover:border-brand-400 transition-colors"/>
                                  </button>
                                </div>
                              )}
                              <div className="flex-1 space-y-3 min-w-0">
                                {(prods.length > 0 || r.product_sold_name) && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                      <Package size={11}/> Produk Dijual
                                    </p>
                                    {r.product_sold_name && <p className="text-xs font-medium text-gray-800 mb-2">⭐ {r.product_sold_name}</p>}
                                    {prods.length > 0 && (
                                      <table className="text-xs w-full max-w-lg">
                                        <thead>
                                          <tr className="text-gray-400 uppercase tracking-wide text-[10px]">
                                            <th className="px-2 py-1 text-left font-semibold">Produk</th>
                                            <th className="px-2 py-1 text-center font-semibold">Klik</th>
                                            <th className="px-2 py-1 text-center font-semibold">Terjual</th>
                                            <th className="px-2 py-1 text-right font-semibold">Total</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                          {prods.map(p => (
                                            <tr key={p.id}>
                                              <td className="px-2 py-1.5 text-gray-800 font-medium">{p.produk_terjual}</td>
                                              <td className="px-2 py-1.5 text-center text-gray-600">{p.product_klik}</td>
                                              <td className="px-2 py-1.5 text-center font-semibold">{p.item_sold}</td>
                                              <td className="px-2 py-1.5 text-right font-semibold text-emerald-700">{fmtRp(p.total)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                )}
                                {r.notes && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Evaluasi</p>
                                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{r.notes}</p>
                                  </div>
                                )}
                                {isSuperadmin && (
                                  <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                                    <button onClick={e => openEdit(r, e)}
                                      className="flex items-center gap-1.5 text-xs bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-100 transition-colors">
                                      <Pencil size={12}/> Edit
                                    </button>
                                    {!isConfirm ? (
                                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(r.id) }}
                                        className="flex items-center gap-1.5 text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-100 transition-colors">
                                        <Trash2 size={12}/> Hapus
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-red-500 font-medium">Hapus laporan ini?</span>
                                        <button onClick={e => handleDelete(r.id, e)} disabled={deleting}
                                          className="text-[11px] bg-red-500 text-white px-2.5 py-1.5 rounded-lg font-semibold hover:bg-red-600 disabled:opacity-60 transition-colors">
                                          {deleting ? '...' : 'Ya, Hapus'}
                                        </button>
                                        <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(null) }}
                                          className="text-[11px] bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg font-semibold hover:bg-gray-200 transition-colors">
                                          Batal
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ────────────────────────────────────────────────────── */}
      {modalMode !== 'none' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)' }}>
              <div>
                <h3 className="font-bold text-brand-900 text-sm">
                  {modalMode === 'add' ? 'Tambah Laporan Live' : 'Edit Live Report'}
                </h3>
                <p className="text-[10px] text-brand-500 mt-0.5">
                  {modalMode === 'add' ? 'Input laporan secara manual' : `${(editRow?.profiles as any)?.full_name} · ${editRow?.brand} · ${editRow ? localDate(editRow.report_date) : ''}`}
                </p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-brand-100 transition-colors">
                <X size={16} className="text-brand-400"/>
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Tanggal *</label>
                  <input type="date" value={form.report_date} onChange={ff('report_date')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Host</label>
                  <select value={form.host_id} onChange={ff('host_id')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                    <option value="">— Pilih Host —</option>
                    {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Brand *</label>
                  <input value={form.brand} onChange={ff('brand')} placeholder="Saga Beauty - Nivea"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Platform</label>
                  <select value={form.platform} onChange={ff('platform')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                    <option value="">— Pilih —</option>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Jam Mulai</label>
                  <input type="time" value={form.start_time} onChange={ff('start_time')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Durasi (jam)</label>
                  <input type="number" min="0" step="0.5" value={form.duration_hours} onChange={ff('duration_hours')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {([
                  { label: 'GMV (Rp)', key: 'gmv' as const },
                  { label: 'Impresi', key: 'impression' as const },
                  { label: 'Penonton', key: 'viewer' as const },
                  { label: 'Transaksi', key: 'trans' as const },
                  { label: 'Komentar', key: 'comment_count' as const },
                ] as { label: string; key: keyof typeof form }[]).map(({ label, key }) => (
                  <div key={key}>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{label}</label>
                    <input type="number" min="0" value={form[key] as number} onChange={ff(key)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Produk Terjual (Utama)</label>
                <input value={form.product_sold_name} onChange={ff('product_sold_name')} placeholder="Nama produk utama"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Evaluasi / Catatan</label>
                <textarea value={form.notes} onChange={ff('notes')} rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"/>
              </div>

              {formError && <p className="text-xs text-red-600 font-medium">{formError}</p>}

              <div className="flex gap-2.5 pt-1">
                <button onClick={closeModal} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                  Batal
                </button>
                <button onClick={saveForm} disabled={saving}
                  className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors shadow-sm">
                  <Save size={14}/> {saving ? 'Menyimpan...' : modalMode === 'add' ? 'Simpan Laporan' : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV Import Modal ────────────────────────────────────────────────────── */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => !importing && setShowCsvModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl my-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)' }}>
              <div>
                <h3 className="font-bold text-emerald-900 text-sm">Import CSV — Preview</h3>
                <p className="text-[10px] text-emerald-600 mt-0.5">
                  {csvRows.length} baris terdeteksi · {csvRows.filter(r => !r._error).length} valid
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={downloadTemplate}
                  className="text-xs text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg font-medium transition-colors">
                  Download Template
                </button>
                <button onClick={() => setShowCsvModal(false)} className="p-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                  <X size={16} className="text-emerald-500"/>
                </button>
              </div>
            </div>

            {importResult ? (
              <div className="p-8 text-center">
                <div className={`text-5xl mb-4 ${importResult.fail === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {importResult.fail === 0 ? '✓' : '⚠'}
                </div>
                <p className="font-bold text-gray-900 text-lg">Import Selesai</p>
                <p className="text-sm text-gray-500 mt-1">{importResult.ok} laporan berhasil diimpor</p>
                {importResult.fail > 0 && <p className="text-sm text-red-500 mt-1">{importResult.fail} gagal</p>}
                <button onClick={() => setShowCsvModal(false)}
                  className="mt-6 bg-brand-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-brand-700 transition-colors">
                  Tutup
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto max-h-[55vh]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100">
                        <th className="px-3 py-2.5 w-10">
                          <input type="checkbox"
                            checked={csvSelected.size === csvRows.filter(r => !r._error).length && csvSelected.size > 0}
                            onChange={e => {
                              if (e.target.checked) setCsvSelected(new Set(csvRows.map((_, i) => i).filter(i => !csvRows[i]._error)))
                              else setCsvSelected(new Set())
                            }} className="rounded accent-brand-600"/>
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold">Tanggal</th>
                        <th className="px-3 py-2.5 text-left font-semibold">Host</th>
                        <th className="px-3 py-2.5 text-left font-semibold">Brand</th>
                        <th className="px-3 py-2.5 text-left font-semibold">Platform</th>
                        <th className="px-3 py-2.5 text-right font-semibold">GMV</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Impresi</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Penonton</th>
                        <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {csvRows.map((row, i) => (
                        <tr key={i} className={row._error ? 'bg-red-50' : csvSelected.has(i) ? 'bg-brand-50/40' : ''}>
                          <td className="px-3 py-2.5">
                            <input type="checkbox" disabled={!!row._error} checked={csvSelected.has(i)}
                              onChange={e => {
                                const s = new Set(csvSelected)
                                e.target.checked ? s.add(i) : s.delete(i)
                                setCsvSelected(s)
                              }} className="rounded accent-brand-600"/>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">{row.report_date || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-700">
                            {row.host_name}
                            {row.host_name && !row.host_id && (
                              <span className="ml-1 text-amber-500" title="Host tidak ditemukan di sistem">⚠</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-gray-800">{row.brand}</td>
                          <td className="px-3 py-2.5 text-gray-600">{row.platform}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-700 font-semibold">{fmtRp(row.gmv)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{fmtNum(row.impression)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{fmtNum(row.viewer)}</td>
                          <td className="px-3 py-2.5">
                            {row._error ? (
                              <span className="flex items-center gap-1 text-red-600 font-medium text-[10px]">
                                <AlertCircle size={11}/> {row._error}
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-semibold">✓ OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    {csvSelected.size} baris dipilih untuk diimpor
                    {csvRows.some(r => r.host_name && !r.host_id) && (
                      <span className="ml-2 text-amber-600">· ⚠ Beberapa host tidak dikenali — akan disimpan tanpa host_id</span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCsvModal(false)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50">
                      Batal
                    </button>
                    <button onClick={runImport} disabled={csvSelected.size === 0 || importing}
                      className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
                      <Upload size={14}/> {importing ? 'Mengimpor...' : `Import ${csvSelected.size} Laporan`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
