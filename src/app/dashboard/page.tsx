'use client'
import { useState, useEffect } from 'react'
import AuthGuard from '@/components/AuthGuard'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { Users, CalendarDays, Activity, CheckCircle, TrendingUp, Eye, MessageCircle } from 'lucide-react'
import { getPayPeriod, toLocalDateStr, PLATFORM_COLORS } from '@/lib/utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import HostDashboard from './HostDashboard'

function fmtShortDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}
function fmtGMV(n: number) {
  if (n >= 1_000_000) return `Rp${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000) return `Rp${(n / 1_000).toFixed(0)}rb`
  return `Rp${n.toLocaleString('id-ID')}`
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
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

// ─── CLIENT DASHBOARD ────────────────────────────────────────────────────────
function ClientDashboard({ profile }: { profile: any }) {
  const [chartMonthIdx, setChartMonthIdx] = useState(0)
  const [stats, setStats] = useState({ totalPlan: 0, totalSucceed: 0, remainingPlan: 0, gmv: 0, impression: 0, viewer: 0, comment: 0, scheduledHours: 0, totalHours: 0 })
  const [chartData, setChartData] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const monthOptions = getMonthOptions()
  const selectedMonth = monthOptions[chartMonthIdx]
  const brand = profile.client_brand

  useEffect(() => {
    if (!brand) return
    setLoading(true)
    const supabase = createClient()
    const todayStr = toLocalDateStr(new Date())
    Promise.all([
      supabase.from('schedule_slots').select('id, durasi')
        .eq('brand', brand)
        .gte('slot_date', selectedMonth.start).lte('slot_date', selectedMonth.end),
      supabase.from('live_reports')
        .select('id, report_date, brand, platform, gmv, impression, viewer, comment_count, screenshot_url, profiles:host_id(full_name)')
        .eq('brand', brand)
        .gte('report_date', selectedMonth.start).lte('report_date', selectedMonth.end)
        .order('report_date', { ascending: false }),
      supabase.from('schedule_slots').select('id', { count: 'exact' })
        .eq('brand', brand)
        .gte('slot_date', todayStr).lte('slot_date', selectedMonth.end),
      supabase.from('invoices')
        .select('id, invoice_items(qty, jam_per_sesi)')
        .eq('brand', brand)
        .order('invoice_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([slotsRes, reportsRes, remainingRes, invoiceRes]) => {
      setLoading(false)
      const reps = reportsRes.data || []
      setReports(reps)
      const totGmv = reps.reduce((s: number, r: any) => s + (r.gmv || 0), 0)
      const totImp = reps.reduce((s: number, r: any) => s + (r.impression || 0), 0)
      const totView = reps.reduce((s: number, r: any) => s + (r.viewer || 0), 0)
      const totCom = reps.reduce((s: number, r: any) => s + (r.comment_count || 0), 0)
      // Scheduled hours = sum of each slot's duration (durasi); null/0 counts as 1h.
      const slotsArr: any[] = slotsRes.data || []
      const scheduledHours = slotsArr.reduce((s: number, x: any) => s + (Number(x.durasi) > 0 ? Number(x.durasi) : 1), 0)
      // Contract hours = total hours on the most recent invoice (qty × jam_per_sesi).
      const invItems: any[] = invoiceRes.data?.invoice_items || []
      const totalHours = invItems.reduce((s: number, i: any) => s + (Number(i.qty) || 0) * (Number(i.jam_per_sesi) || 0), 0)
      setStats({ totalPlan: slotsArr.length, totalSucceed: reps.length, remainingPlan: remainingRes.count || 0, gmv: totGmv, impression: totImp, viewer: totView, comment: totCom, scheduledHours, totalHours })
      const byDate: Record<string, any> = {}
      ;[...reps].reverse().forEach((r: any) => {
        if (!byDate[r.report_date]) byDate[r.report_date] = { date: r.report_date, gmv: 0, impression: 0, viewer: 0, comment: 0 }
        byDate[r.report_date].gmv += r.gmv || 0
        byDate[r.report_date].impression += r.impression || 0
        byDate[r.report_date].viewer += r.viewer || 0
        byDate[r.report_date].comment += r.comment_count || 0
      })
      setChartData(Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date)))
    })
  }, [brand, selectedMonth.start, selectedMonth.end])

  const successPct = stats.totalPlan > 0 ? Math.round((stats.totalSucceed / stats.totalPlan) * 100) : 0
  const emptyChart = chartData.length === 0
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <AppShell role="client" userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard — {brand || 'Brand'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{today}</p>
          </div>
          <select value={chartMonthIdx} onChange={e => setChartMonthIdx(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
            {monthOptions.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              label: 'Total Live Plan',
              // Big = scheduled hours this month. Small faded = contract hours from last
              // invoice; hidden once the contract is fully consumed (awaiting a new invoice).
              value: (
                <span className="inline-flex items-baseline gap-1">
                  <span>{stats.scheduledHours}j</span>
                  {stats.totalHours > 0 && stats.scheduledHours < stats.totalHours && (
                    <span className="text-sm font-medium text-gray-300">/ {stats.totalHours}j</span>
                  )}
                </span>
              ),
              icon: CalendarDays, ib: 'bg-blue-50', ic: 'text-blue-600',
            },
            { label: 'Live Sukses', value: `${stats.totalSucceed} (${successPct}%)`, icon: CheckCircle, ib: 'bg-emerald-50', ic: 'text-emerald-600' },
            { label: 'Total GMV', value: fmtGMV(stats.gmv), icon: TrendingUp, ib: 'bg-purple-50', ic: 'text-purple-600' },
            { label: 'Total Impresi', value: fmtNum(stats.impression), icon: Eye, ib: 'bg-sky-50', ic: 'text-sky-600' },
            { label: 'Total Penonton', value: fmtNum(stats.viewer), icon: Users, ib: 'bg-teal-50', ic: 'text-teal-600' },
            { label: 'Total Komentar', value: fmtNum(stats.comment), icon: MessageCircle, ib: 'bg-amber-50', ic: 'text-amber-600' },
          ].map(({ label, value, icon: Icon, ib, ic }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${ib}`}>
                  <Icon size={14} className={ic}/>
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Traffic chart — MAIN FOCAL POINT */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 text-sm">Traffic per Hari</h2>
          <p className="text-xs text-gray-400 mb-3">Impresi · Penonton · Komentar</p>
          {emptyChart ? (
            <div className="h-[160px] flex items-center justify-center text-sm text-gray-300">{loading ? 'Memuat...' : 'Belum ada data'}</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false}/>
                <YAxis tickFormatter={(v: any) => fmtNum(Number(v))} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={40}/>
                <Tooltip labelFormatter={(l: any) => fmtShortDate(String(l))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}/>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }}/>
                <Line type="monotone" dataKey="impression" name="Impresi" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }}/>
                <Line type="monotone" dataKey="viewer" name="Penonton" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }}/>
                <Line type="monotone" dataKey="comment" name="Komentar" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }}/>
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* GMV chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 text-sm">GMV per Hari</h2>
          <p className="text-xs text-gray-400 mb-3">Pendapatan dari laporan live</p>
          {emptyChart ? (
            <div className="h-[120px] flex items-center justify-center text-sm text-gray-300">{loading ? 'Memuat...' : 'Belum ada data'}</div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false}/>
                <YAxis tickFormatter={(v: any) => fmtGMV(Number(v)).replace('Rp', '')} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={42}/>
                <Tooltip formatter={(v: any) => [`Rp${Number(v).toLocaleString('id-ID')}`, 'GMV']}
                  labelFormatter={(l: any) => fmtShortDate(String(l))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}/>
                <Line type="monotone" dataKey="gmv" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}/>
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>
    </AppShell>
  )
}

// ─── COMPANY DASHBOARD ───────────────────────────────────────────────────────
function CompanyDashboard({ profile }: { profile: any }) {
  const [chartMonthIdx, setChartMonthIdx] = useState(0)
  const [activeHosts, setActiveHosts] = useState(0)
  const [monthStats, setMonthStats] = useState({ totalLive: 0, liveSucceed: 0, totalGmv: 0 })
  const [chartData, setChartData] = useState<any[]>([])
  const [clientMeters, setClientMeters] = useState<{ brand: string; slots: number; reports: number }[]>([])
  const [loading, setLoading] = useState(false)

  const monthOptions = getMonthOptions()
  const selectedMonth = monthOptions[chartMonthIdx]
  const payPeriod = getPayPeriod()

  useEffect(() => {
    createClient().from('profiles').select('id', { count: 'exact' })
      .eq('role', 'host').eq('is_active', true)
      .then(({ count }) => setActiveHosts(count || 0))
  }, [])

  useEffect(() => {
    setLoading(true)
    const supabase = createClient()
    Promise.all([
      supabase.from('schedule_slots').select('id, brand', { count: 'exact' })
        .not('host_id', 'is', null)
        .gte('slot_date', selectedMonth.start).lte('slot_date', selectedMonth.end),
      supabase.from('live_reports')
        .select('id, report_date, brand, platform, gmv, impression, viewer, comment_count, screenshot_url, profiles:host_id(full_name)')
        .gte('report_date', selectedMonth.start).lte('report_date', selectedMonth.end)
        .order('report_date', { ascending: false }),
    ]).then(([slotsRes, reportsRes]) => {
      setLoading(false)
      const reports = reportsRes.data || []
      const slotsArr = slotsRes.data || []
      setMonthStats({
        totalLive: slotsRes.count || 0,
        liveSucceed: reports.length,
        totalGmv: reports.reduce((s: number, r: any) => s + (r.gmv || 0), 0),
      })

      const byDate: Record<string, any> = {}
      ;[...reports].reverse().forEach((r: any) => {
        if (!byDate[r.report_date]) byDate[r.report_date] = { date: r.report_date, gmv: 0, impression: 0, viewer: 0, comment: 0 }
        byDate[r.report_date].gmv += r.gmv || 0
        byDate[r.report_date].impression += r.impression || 0
        byDate[r.report_date].viewer += r.viewer || 0
        byDate[r.report_date].comment += r.comment_count || 0
      })
      setChartData(Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date)))

      // Per-brand meters
      const slotsByBrand: Record<string, number> = {}
      slotsArr.forEach((s: any) => { if (s.brand) slotsByBrand[s.brand] = (slotsByBrand[s.brand] || 0) + 1 })
      const reportsByBrand: Record<string, number> = {}
      reports.forEach((r: any) => { if (r.brand) reportsByBrand[r.brand] = (reportsByBrand[r.brand] || 0) + 1 })
      const allBrands = Array.from(new Set([...Object.keys(slotsByBrand), ...Object.keys(reportsByBrand)])).sort()
      setClientMeters(allBrands.map(brand => ({
        brand,
        slots: slotsByBrand[brand] || 0,
        reports: reportsByBrand[brand] || 0,
      })))
    })
  }, [selectedMonth.start, selectedMonth.end])

  const { totalLive, liveSucceed, totalGmv } = monthStats
  const successPct = totalLive > 0 ? Math.round((liveSucceed / totalLive) * 100) : 0
  const emptyChart = chartData.length === 0
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Halo, {profile.full_name.split(' ')[0]} 👋</h1>
            <p className="text-sm text-gray-500 mt-0.5">{today}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 bg-brand-50 border border-brand-200 text-brand-700 text-xs font-medium px-3 py-1 rounded-full">
              <CalendarDays size={11}/> Periode: {payPeriod.label}
            </div>
          </div>
          <select value={chartMonthIdx} onChange={e => setChartMonthIdx(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
            {monthOptions.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Host Aktif', value: activeHosts, icon: Users, ib: 'bg-brand-50', ic: 'text-brand-600' },
            { label: 'Total Live', value: totalLive, icon: CalendarDays, ib: 'bg-blue-50', ic: 'text-blue-600' },
            { label: 'Live Sukses', value: `${liveSucceed} (${successPct}%)`, icon: CheckCircle, ib: 'bg-emerald-50', ic: 'text-emerald-600' },
            { label: 'Total GMV', value: fmtGMV(totalGmv), icon: TrendingUp, ib: 'bg-purple-50', ic: 'text-purple-600' },
          ].map(({ label, value, icon: Icon, ib, ic }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${ib}`}>
                  <Icon size={14} className={ic}/>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* GMV chart — MAIN FOCAL POINT (full width, biggest) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between mb-1">
            <h2 className="font-bold text-gray-900 text-sm">GMV per Hari</h2>
            <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{selectedMonth.label}</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">Pendapatan dari semua laporan live</p>
          {emptyChart ? (
            <div className="h-[160px] flex items-center justify-center text-sm text-gray-300">{loading ? 'Memuat...' : 'Belum ada data bulan ini'}</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false}/>
                <YAxis tickFormatter={(v: any) => fmtGMV(Number(v)).replace('Rp', '')} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={46}/>
                <Tooltip formatter={(v: any) => [`Rp${Number(v).toLocaleString('id-ID')}`, 'GMV']}
                  labelFormatter={(l: any) => fmtShortDate(String(l))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}/>
                <Line type="monotone" dataKey="gmv" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}/>
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Traffic + Live Meter side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 text-sm">Traffic per Hari</h2>
            <p className="text-xs text-gray-400 mb-3">Impresi · Penonton · Komentar — semua host</p>
            {emptyChart ? (
              <div className="h-[130px] flex items-center justify-center text-sm text-gray-300">{loading ? 'Memuat...' : 'Belum ada data'}</div>
            ) : (
              <ResponsiveContainer width="100%" height={155}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false}/>
                  <YAxis tickFormatter={(v: any) => fmtNum(Number(v))} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={40}/>
                  <Tooltip labelFormatter={(l: any) => fmtShortDate(String(l))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}/>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }}/>
                  <Line type="monotone" dataKey="impression" name="Impresi" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2.5 }}/>
                  <Line type="monotone" dataKey="viewer" name="Penonton" stroke="#10b981" strokeWidth={2} dot={{ r: 2.5 }}/>
                  <Line type="monotone" dataKey="comment" name="Komentar" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5 }}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-gray-900 text-sm">Live Meter</h2>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{successPct}% overall</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">Live sukses per brand · {liveSucceed}/{totalLive} total</p>
            {clientMeters.length === 0 ? (
              <div className="h-[100px] flex items-center justify-center text-sm text-gray-300">
                {loading ? 'Memuat...' : 'Belum ada data'}
              </div>
            ) : (
              <div className="space-y-3 max-h-[155px] overflow-y-auto pr-1">
                {clientMeters.map(m => {
                  const pct = m.slots > 0 ? Math.min(Math.round((m.reports / m.slots) * 100), 100) : 0
                  return (
                    <div key={m.brand}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-700 truncate max-w-[60%]">{m.brand}</span>
                        <span className="text-[10px] text-gray-500 flex-shrink-0">{m.reports}/{m.slots}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-brand-500'}`}
                          style={{ width: `${pct}%` }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </AppShell>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <AuthGuard>
      {(profile) => {
        if (profile.role === 'host') return <HostDashboard profile={profile} />
        if (profile.role === 'client') return <ClientDashboard profile={profile} />
        return <CompanyDashboard profile={profile} />
      }}
    </AuthGuard>
  )
}
