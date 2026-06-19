'use client'
import { useState, useEffect } from 'react'
import AuthGuard from '@/components/AuthGuard'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { Users, CalendarDays, Activity, Camera } from 'lucide-react'
import { getPayPeriod, toLocalDateStr, PLATFORM_COLORS } from '@/lib/utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
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
  const [stats, setStats] = useState({ totalPlan: 0, totalSucceed: 0, gmv: 0, impression: 0, viewer: 0, comment: 0 })
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
    Promise.all([
      supabase.from('schedule_slots').select('id', { count: 'exact' })
        .eq('brand', brand)
        .gte('slot_date', selectedMonth.start).lte('slot_date', selectedMonth.end),
      supabase.from('live_reports')
        .select('id, report_date, brand, platform, gmv, impression, viewer, comment_count, screenshot_url, profiles:host_id(full_name)')
        .eq('brand', brand)
        .gte('report_date', selectedMonth.start).lte('report_date', selectedMonth.end)
        .order('report_date', { ascending: false }),
    ]).then(([slotsRes, reportsRes]) => {
      setLoading(false)
      const reps = reportsRes.data || []
      setReports(reps)
      const totGmv = reps.reduce((s: number, r: any) => s + (r.gmv || 0), 0)
      const totImp = reps.reduce((s: number, r: any) => s + (r.impression || 0), 0)
      const totView = reps.reduce((s: number, r: any) => s + (r.viewer || 0), 0)
      const totCom = reps.reduce((s: number, r: any) => s + (r.comment_count || 0), 0)
      setStats({ totalPlan: slotsRes.count || 0, totalSucceed: reps.length, gmv: totGmv, impression: totImp, viewer: totView, comment: totCom })
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
            { label: 'Total Live Plan', value: stats.totalPlan, color: 'bg-blue-50 border-blue-100', text: 'text-blue-700' },
            { label: 'Live Sukses', value: `${stats.totalSucceed} (${successPct}%)`, color: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700' },
            { label: 'Total GMV', value: fmtGMV(stats.gmv), color: 'bg-purple-50 border-purple-100', text: 'text-purple-700' },
            { label: 'Total Impresi', value: fmtNum(stats.impression), color: 'bg-sky-50 border-sky-100', text: 'text-sky-700' },
            { label: 'Total Penonton', value: fmtNum(stats.viewer), color: 'bg-teal-50 border-teal-100', text: 'text-teal-700' },
            { label: 'Total Komentar', value: fmtNum(stats.comment), color: 'bg-amber-50 border-amber-100', text: 'text-amber-700' },
          ].map(({ label, value, color, text }) => (
            <div key={label} className={`bg-white rounded-2xl border p-4 shadow-sm ${color}`}>
              <p className={`text-xs font-medium mb-1 ${text}`}>{label}</p>
              <p className={`text-xl font-bold ${text}`}>{value}</p>
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

        {/* Live Report table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Live Report Detail</h2>
              <p className="text-xs text-gray-400 mt-0.5">Semua laporan live brand {brand}</p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{reports.length} laporan</span>
          </div>
          {reports.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">Belum ada laporan bulan ini</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold">Tanggal</th>
                    <th className="px-4 py-3 text-left font-semibold">Host</th>
                    <th className="px-4 py-3 text-left font-semibold">Platform</th>
                    <th className="px-4 py-3 text-right font-semibold">GMV</th>
                    <th className="px-4 py-3 text-right font-semibold">Impresi</th>
                    <th className="px-4 py-3 text-right font-semibold">Penonton</th>
                    <th className="px-4 py-3 text-right font-semibold">Komentar</th>
                    <th className="px-4 py-3 text-center font-semibold">SS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reports.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(r.report_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-gray-800">{(r.profiles as any)?.full_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        {r.platform && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[r.platform] || PLATFORM_COLORS.Other}`}>{r.platform}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-700">{fmtGMV(r.gmv || 0)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500">{fmtNum(r.impression || 0)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500">{fmtNum(r.viewer || 0)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500">{fmtNum(r.comment_count || 0)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {r.screenshot_url ? (
                          <button onClick={() => window.open(r.screenshot_url, '_blank')}>
                            <img src={r.screenshot_url} alt="ss" className="w-8 h-8 rounded-lg object-cover border border-gray-200 hover:border-brand-400 transition-colors mx-auto"/>
                          </button>
                        ) : <Camera size={14} className="text-gray-200 mx-auto"/>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
  const [recentReports, setRecentReports] = useState<any[]>([])
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
      supabase.from('schedule_slots').select('id', { count: 'exact' })
        .not('host_id', 'is', null)
        .gte('slot_date', selectedMonth.start).lte('slot_date', selectedMonth.end),
      supabase.from('live_reports')
        .select('id, report_date, brand, platform, gmv, impression, viewer, comment_count, screenshot_url, profiles:host_id(full_name)')
        .gte('report_date', selectedMonth.start).lte('report_date', selectedMonth.end)
        .order('report_date', { ascending: false }),
    ]).then(([slotsCount, reportsRes]) => {
      setLoading(false)
      const reports = reportsRes.data || []
      setMonthStats({
        totalLive: slotsCount.count || 0,
        liveSucceed: reports.length,
        totalGmv: reports.reduce((s: number, r: any) => s + (r.gmv || 0), 0),
      })
      setRecentReports(reports.slice(0, 50))
      const byDate: Record<string, any> = {}
      ;[...reports].reverse().forEach((r: any) => {
        if (!byDate[r.report_date]) byDate[r.report_date] = { date: r.report_date, gmv: 0, impression: 0, viewer: 0, comment: 0 }
        byDate[r.report_date].gmv += r.gmv || 0
        byDate[r.report_date].impression += r.impression || 0
        byDate[r.report_date].viewer += r.viewer || 0
        byDate[r.report_date].comment += r.comment_count || 0
      })
      setChartData(Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date)))
    })
  }, [selectedMonth.start, selectedMonth.end])

  const { totalLive, liveSucceed, totalGmv } = monthStats
  const successPct = totalLive > 0 ? Math.round((liveSucceed / totalLive) * 100) : 0
  const emptyChart = chartData.length === 0
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const gaugeData = [
    { name: 'Sukses', value: liveSucceed > 0 ? liveSucceed : 0.01 },
    { name: 'Belum', value: Math.max(totalLive - liveSucceed, 0) > 0 ? Math.max(totalLive - liveSucceed, 0) : (liveSucceed === 0 ? 0.99 : 0.001) },
  ]

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
            { label: 'Total Host Aktif', value: activeHosts, color: 'bg-brand-50 border-brand-100', text: 'text-brand-700' },
            { label: 'Total Live', value: totalLive, color: 'bg-blue-50 border-blue-100', text: 'text-blue-700' },
            { label: 'Live Sukses', value: `${liveSucceed} (${successPct}%)`, color: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700' },
            { label: 'Total GMV', value: fmtGMV(totalGmv), color: 'bg-purple-50 border-purple-100', text: 'text-purple-700' },
          ].map(({ label, value, color, text }) => (
            <div key={label} className={`bg-white rounded-2xl border p-4 shadow-sm ${color}`}>
              <p className={`text-xs font-medium mb-1 ${text}`}>{label}</p>
              <p className={`text-2xl font-bold ${text}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Traffic chart — MAIN FOCAL POINT (full width, biggest) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 text-sm">Traffic per Hari</h2>
          <p className="text-xs text-gray-400 mb-3">Impresi · Penonton · Komentar — semua host</p>
          {emptyChart ? (
            <div className="h-[160px] flex items-center justify-center text-sm text-gray-300">{loading ? 'Memuat...' : 'Belum ada data bulan ini'}</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
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

        {/* Gauge + GMV chart side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 text-sm">Live Sukses</h2>
            <p className="text-xs text-gray-400 mb-3">Sesi yang berhasil dilaporkan</p>
            <div className="relative">
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={gaugeData} cx="50%" cy="100%" startAngle={180} endAngle={0}
                    innerRadius="55%" outerRadius="85%" dataKey="value" strokeWidth={0}
                    paddingAngle={liveSucceed > 0 && liveSucceed < totalLive ? 4 : 0}>
                    <Cell fill="#7c3aed" /><Cell fill="#e5e7eb" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-x-0 bottom-2 flex flex-col items-center pointer-events-none">
                <span className="text-3xl font-bold text-brand-700 leading-none">{liveSucceed}</span>
                <span className="text-xs text-gray-400 mt-0.5">dari {totalLive} live</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-5 mt-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-600 flex-shrink-0"/>
                <span className="text-xs text-gray-600">Sukses ({liveSucceed})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-200 flex-shrink-0"/>
                <span className="text-xs text-gray-600">Belum ({Math.max(totalLive - liveSucceed, 0)})</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 text-sm">GMV per Hari</h2>
            <p className="text-xs text-gray-400 mb-3">Pendapatan dari laporan live</p>
            {emptyChart ? (
              <div className="h-[130px] flex items-center justify-center text-sm text-gray-300">{loading ? 'Memuat...' : 'Belum ada data'}</div>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false}/>
                  <YAxis tickFormatter={(v: any) => fmtGMV(Number(v)).replace('Rp', '')} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={42}/>
                  <Tooltip formatter={(v: any) => [`Rp${Number(v).toLocaleString('id-ID')}`, 'GMV']}
                    labelFormatter={(l: any) => fmtShortDate(String(l))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}/>
                  <Line type="monotone" dataKey="gmv" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Live Report table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Live Report Terbaru</h2>
              <p className="text-xs text-gray-400 mt-0.5">Semua host · bulan ini</p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{recentReports.length} laporan</span>
          </div>
          {recentReports.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">Belum ada laporan bulan ini</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold">Tanggal</th>
                    <th className="px-4 py-3 text-left font-semibold">Host</th>
                    <th className="px-4 py-3 text-left font-semibold">Brand</th>
                    <th className="px-4 py-3 text-left font-semibold">Platform</th>
                    <th className="px-4 py-3 text-right font-semibold">GMV</th>
                    <th className="px-4 py-3 text-right font-semibold">Impresi</th>
                    <th className="px-4 py-3 text-right font-semibold">Penonton</th>
                    <th className="px-4 py-3 text-center font-semibold">SS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentReports.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(r.report_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800 text-xs">{(r.profiles as any)?.full_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{r.brand || '—'}</td>
                      <td className="px-4 py-2.5">
                        {r.platform && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[r.platform] || PLATFORM_COLORS.Other}`}>{r.platform}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-700">{fmtGMV(r.gmv || 0)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500">{fmtNum(r.impression || 0)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500">{fmtNum(r.viewer || 0)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {r.screenshot_url ? (
                          <button onClick={() => window.open(r.screenshot_url, '_blank')}>
                            <img src={r.screenshot_url} alt="ss" className="w-8 h-8 rounded-lg object-cover border border-gray-200 hover:border-brand-400 transition-colors mx-auto"/>
                          </button>
                        ) : <Camera size={14} className="text-gray-200 mx-auto"/>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
