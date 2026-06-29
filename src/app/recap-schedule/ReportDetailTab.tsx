'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PLATFORM_COLORS } from '@/lib/utils'
import { Filter, Download, Package, TrendingUp, FileText, ChevronDown, ChevronUp, Pencil, Trash2, X, Save } from 'lucide-react'

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

const EMPTY_EDIT = {
  report_date: '', host_id: '', brand: '', platform: '', start_time: '',
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

  // Edit state
  const [editRow, setEditRow] = useState<ReportRow | null>(null)
  const [editForm, setEditForm] = useState({ ...EMPTY_EDIT })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    } else {
      setProducts([])
    }
    setLoading(false)
  }, [month.start, month.end, selectedHost, selectedBrand])

  useEffect(() => { fetchData() }, [fetchData])

  const productsByReport: Record<string, ProductRow[]> = {}
  products.forEach(p => {
    if (!productsByReport[p.live_report_id]) productsByReport[p.live_report_id] = []
    productsByReport[p.live_report_id].push(p)
  })

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const totalGmv = reports.reduce((s, r) => s + (r.gmv || 0), 0)

  // ── Edit ─────────────────────────────────────────────────────────────────────
  function openEdit(r: ReportRow, e: React.MouseEvent) {
    e.stopPropagation()
    setEditRow(r)
    setEditForm({
      report_date: r.report_date,
      host_id: r.host_id,
      brand: r.brand || '',
      platform: r.platform || '',
      start_time: r.start_time || '',
      duration_hours: r.duration_hours || 0,
      gmv: r.gmv || 0,
      impression: r.impression || 0,
      viewer: r.viewer || 0,
      trans: r.trans || 0,
      comment_count: r.comment_count || 0,
      product_sold_name: r.product_sold_name || '',
      notes: r.notes || '',
    })
    setEditError('')
  }

  async function saveEdit() {
    if (!editRow) return
    setSaving(true); setEditError('')
    const supabase = createClient()
    const { error } = await supabase.from('live_reports').update({
      report_date: editForm.report_date,
      host_id: editForm.host_id || null,
      brand: editForm.brand || null,
      platform: editForm.platform || null,
      start_time: editForm.start_time || null,
      duration_hours: Number(editForm.duration_hours) || null,
      gmv: Number(editForm.gmv) || 0,
      impression: Number(editForm.impression) || 0,
      viewer: Number(editForm.viewer) || 0,
      trans: Number(editForm.trans) || 0,
      comment_count: Number(editForm.comment_count) || 0,
      product_sold_name: editForm.product_sold_name || null,
      notes: editForm.notes || null,
    }).eq('id', editRow.id)
    setSaving(false)
    if (error) { setEditError(error.message); return }
    setEditRow(null)
    fetchData()
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    await createClient().from('live_reports').delete().eq('id', id)
    setReports(prev => prev.filter(r => r.id !== id))
    setConfirmDeleteId(null)
    setDeleting(false)
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
        'Tanggal': r.report_date,
        'Host': r.profiles?.full_name || '',
        'Brand': r.brand || '',
        'Produk': p.produk_terjual,
        'Klik': p.product_klik,
        'Terjual': p.item_sold,
        'Total': p.total,
      }))
    )
    if (prodRows.length) {
      utils.book_append_sheet(wb, utils.json_to_sheet(prodRows), 'Produk Terjual')
    }
    const parts = ['LiveReport', month.label.replace(/\s+/g, '-')]
    if (selectedHost) parts.push(hosts.find(h => h.id === selectedHost)?.full_name.replace(/\s+/g, '') || '')
    if (selectedBrand) parts.push(selectedBrand.replace(/\s+/g, ''))
    writeFile(wb, `${parts.filter(Boolean).join('_')}.xlsx`)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const f = (key: keyof typeof editForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEditForm(prev => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="max-w-6xl mx-auto">
      {/* Filters + export */}
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
        <button onClick={exportExcel} disabled={reports.length === 0}
          className="ml-auto flex items-center gap-1.5 text-sm bg-emerald-600 text-white px-3.5 py-2 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
          <Download size={14}/> Unduh Excel
        </button>
      </div>

      {/* Summary */}
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
                      <tr key={r.id} onClick={() => toggleExpand(r.id)} className="hover:bg-gray-50 cursor-pointer transition-colors">
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
                                    {r.product_sold_name && (
                                      <p className="text-xs font-medium text-gray-800 mb-2">⭐ {r.product_sold_name}</p>
                                    )}
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

                                {/* Superadmin actions */}
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

      {/* Edit Modal */}
      {editRow && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setEditRow(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)' }}>
              <div>
                <h3 className="font-bold text-brand-900 text-sm">Edit Live Report</h3>
                <p className="text-[10px] text-brand-500 mt-0.5">
                  {(editRow.profiles as any)?.full_name} · {editRow.brand} · {localDate(editRow.report_date)}
                </p>
              </div>
              <button onClick={() => setEditRow(null)} className="p-1.5 rounded-lg hover:bg-brand-100 transition-colors">
                <X size={16} className="text-brand-400"/>
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Tanggal</label>
                  <input type="date" value={editForm.report_date} onChange={f('report_date')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Host</label>
                  <select value={editForm.host_id} onChange={f('host_id')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                    <option value="">— Pilih Host —</option>
                    {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Brand</label>
                  <input value={editForm.brand} onChange={f('brand')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Platform</label>
                  <select value={editForm.platform} onChange={f('platform')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                    <option value="">— Pilih —</option>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {([
                  { label: 'GMV (Rp)', key: 'gmv' as const },
                  { label: 'Impresi', key: 'impression' as const },
                  { label: 'Penonton', key: 'viewer' as const },
                  { label: 'Transaksi', key: 'trans' as const },
                  { label: 'Komentar', key: 'comment_count' as const },
                  { label: 'Durasi (jam)', key: 'duration_hours' as const },
                ] as { label: string; key: keyof typeof editForm }[]).map(({ label, key }) => (
                  <div key={key}>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{label}</label>
                    <input type="number" min="0" value={editForm[key] as number} onChange={f(key)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Produk Terjual (Utama)</label>
                <input value={editForm.product_sold_name} onChange={f('product_sold_name')}
                  placeholder="Nama produk utama yang terjual"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Evaluasi / Catatan</label>
                <textarea value={editForm.notes} onChange={f('notes')} rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"/>
              </div>

              {editError && <p className="text-xs text-red-600 font-medium">{editError}</p>}

              <div className="flex gap-2.5 pt-1">
                <button onClick={() => setEditRow(null)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                  Batal
                </button>
                <button onClick={saveEdit} disabled={saving}
                  className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors shadow-sm">
                  <Save size={14}/> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
