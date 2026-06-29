'use client'
import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { PLATFORM_COLORS } from '@/lib/utils'
import { ChevronDown, ChevronUp, Package } from 'lucide-react'

interface ReportRow {
  id: string; report_date: string; brand: string | null; platform: string | null
  start_time: string | null; duration_hours: number | null
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  notes: string | null; product_sold_name: string | null
  host_id: string; profiles: { full_name: string } | null
}
interface ProductRow {
  id: string; live_report_id: string; produk_terjual: string
  product_klik: number; item_sold: number; total: number
}

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

export default function ClientLiveReportClient({ profile }: { profile: any }) {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [monthIdx, setMonthIdx] = useState(0)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const monthOptions = getMonthOptions()
  const month = monthOptions[monthIdx]

  const fetchData = useCallback(async () => {
    if (!profile.client_brand) return
    setLoading(true)
    const supabase = createClient()

    const { data: reps } = await supabase
      .from('live_reports')
      .select('id, report_date, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, notes, product_sold_name, host_id, profiles:host_id(full_name)')
      .eq('brand', profile.client_brand)
      .gte('report_date', month.start).lte('report_date', month.end)
      .order('report_date', { ascending: false })
      .order('start_time', { ascending: false })

    const rows = (reps as unknown as ReportRow[]) || []
    setReports(rows)

    const ids = rows.map(r => r.id)
    if (ids.length) {
      const { data: prods } = await supabase
        .from('live_report_products')
        .select('id, live_report_id, produk_terjual, product_klik, item_sold, total')
        .in('live_report_id', ids)
      setProducts((prods as ProductRow[]) || [])
    } else {
      setProducts([])
    }
    setLoading(false)
  }, [month.start, month.end, profile.client_brand])

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

  return (
    <AppShell role="client" userName={profile.full_name}>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Laporan Live</h1>
            {profile.client_brand && (
              <p className="text-sm text-gray-500 mt-0.5">
                Brand: <span className="font-semibold text-brand-700">{profile.client_brand}</span>
              </p>
            )}
          </div>
          <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
            {monthOptions.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
          </select>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-brand-50 border border-brand-100 rounded-2xl p-4">
            <p className="text-xs text-brand-500 font-medium">Total Laporan</p>
            <p className="text-2xl font-bold text-brand-700 mt-0.5">{reports.length}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <p className="text-xs text-emerald-600 font-medium">Total GMV</p>
            <p className="text-lg font-bold text-emerald-700 mt-0.5">{fmtRp(totalGmv)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 hidden sm:block">
            <p className="text-xs text-blue-500 font-medium">Total Impresi</p>
            <p className="text-2xl font-bold text-blue-700 mt-0.5">
              {fmtNum(reports.reduce((s, r) => s + (r.impression || 0), 0))}
            </p>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">Memuat...</div>
        ) : reports.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
            Tidak ada laporan untuk {month.label}
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
                    return (
                      <>
                        <tr
                          key={r.id}
                          onClick={() => toggleExpand(r.id)}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                        >
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
                          <td className="px-3 py-3 text-xs text-gray-500 max-w-[160px] truncate">
                            {r.notes || '—'}
                          </td>
                          <td className="px-3 py-3 text-gray-400">
                            {isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${r.id}-detail`}>
                            <td colSpan={11} className="bg-gray-50 px-4 py-4 border-b border-gray-100">
                              <div className="space-y-3">
                                {/* Product table */}
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
                                {/* Evaluation */}
                                {r.notes && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Evaluasi</p>
                                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{r.notes}</p>
                                  </div>
                                )}
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
      </div>
    </AppShell>
  )
}
