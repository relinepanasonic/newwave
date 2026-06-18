'use client'
import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getPayPeriod, toLocalDateStr, SESSION_LABELS, PLATFORM_COLORS } from '@/lib/utils'
import { Bell, BellOff, Target, Camera } from 'lucide-react'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'

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
function fmtShortDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}
function getMonthOptions() {
  const months = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    const y = d.getFullYear(); const m = d.getMonth()
    months.push({
      label: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
      start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end: `${y}-${String(m + 1).padStart(2, '00')}-${new Date(y, m + 1, 0).getDate()}`,
    })
  }
  return months
}

export default function HostDashboard({ profile }: { profile: any }) {
  const [periodHours, setPeriodHours] = useState(0)
  const [todaySlots, setTodaySlots] = useState<any[]>([])
  const [reportMap, setReportMap] = useState<Record<string, any>>({})
  const [alarmMsg, setAlarmMsg] = useState<string | null>(null)
  const [notifPerm, setNotifPerm] = useState<string>('default')

  const [chartMonthIdx, setChartMonthIdx] = useState(0)
  const [monthStats, setMonthStats] = useState({ totalLive: 0, liveSucceed: 0, totalGmv: 0 })
  const [chartData, setChartData] = useState<any[]>([])
  const [monthSlots, setMonthSlots] = useState<any[]>([])
  const [monthReportMap, setMonthReportMap] = useState<Record<string, boolean>>({})

  const monthOptions = getMonthOptions()
  const selectedMonth = monthOptions[chartMonthIdx]
  const payPeriod = getPayPeriod()
  const todayStr = toLocalDateStr(new Date())
  const periodStart = toLocalDateStr(payPeriod.start)
  const periodEnd = toLocalDateStr(payPeriod.end)
  const targetHours = profile.target_hours || 155

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window)
      setNotifPerm(Notification.permission)
  }, [])

  const fetchPeriodData = useCallback(async () => {
    const supabase = createClient()
    const [slotsRes, checkinRes, reportsRes] = await Promise.all([
      supabase.from('schedule_slots')
        .select('id, session_no, status, brand, platform, rooms:room_id(name), check_ins(total_hours)')
        .eq('slot_date', todayStr).eq('host_id', profile.id).order('session_no'),
      supabase.from('check_ins').select('total_hours').eq('host_id', profile.id)
        .gte('check_in_time', periodStart).lte('check_in_time', periodEnd + 'T23:59:59'),
      supabase.from('live_reports').select('slot_id, id, screenshot_url, gmv')
        .eq('host_id', profile.id).eq('report_date', todayStr),
    ])
    setTodaySlots(slotsRes.data || [])
    setPeriodHours((checkinRes.data || []).reduce((s: number, c: any) => s + (c.total_hours || 0), 0))
    const rMap: Record<string, any> = {}
    ;(reportsRes.data || []).forEach((r: any) => { if (r.slot_id) rMap[r.slot_id] = r })
    setReportMap(rMap)
  }, [profile.id, todayStr, periodStart, periodEnd])

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('schedule_slots')
        .select('id, slot_date, session_no, brand, rooms:room_id(name)')
        .eq('host_id', profile.id)
        .gte('slot_date', selectedMonth.start).lte('slot_date', selectedMonth.end)
        .order('slot_date', { ascending: false }).order('session_no'),
      supabase.from('live_reports')
        .select('report_date, gmv, impression, viewer, comment_count, slot_id')
        .eq('host_id', profile.id)
        .gte('report_date', selectedMonth.start).lte('report_date', selectedMonth.end)
        .order('report_date'),
    ]).then(([slotsRes, reportsRes]) => {
      const slots = slotsRes.data || []
      const reports = reportsRes.data || []
      setMonthSlots(slots)
      const rMap: Record<string, boolean> = {}
      reports.forEach((r: any) => { if (r.slot_id) rMap[r.slot_id] = true })
      setMonthReportMap(rMap)
      setMonthStats({
        totalLive: slots.length,
        liveSucceed: reports.length,
        totalGmv: reports.reduce((s: number, r: any) => s + (r.gmv || 0), 0),
      })
      const byDate: Record<string, any> = {}
      reports.forEach((r: any) => {
        if (!byDate[r.report_date]) byDate[r.report_date] = { date: r.report_date, gmv: 0, impression: 0, viewer: 0, comment: 0 }
        byDate[r.report_date].gmv += r.gmv || 0
        byDate[r.report_date].impression += r.impression || 0
        byDate[r.report_date].viewer += r.viewer || 0
        byDate[r.report_date].comment += r.comment_count || 0
      })
      setChartData(Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date)))
    })
  }, [profile.id, selectedMonth.start, selectedMonth.end])

  useEffect(() => { fetchPeriodData() }, [fetchPeriodData])

  useEffect(() => {
    const check = () => {
      const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
      let nearest: { msg: string; diff: number } | null = null
      for (const slot of todaySlots) {
        if (slot.status !== 'cancelled') {
          const diff = (slot.session_no - 1) * 60 - nowMins
          if (diff > 0 && diff <= 15 && (!nearest || diff < nearest.diff))
            nearest = { msg: `Sesi ${SESSION_LABELS[slot.session_no]} di ${slot.rooms?.name || 'Room'} mulai dalam ${diff} menit!`, diff }
        }
      }
      setAlarmMsg(nearest ? nearest.msg : null)
      if (nearest && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted')
        new Notification('⏰ Jadwal Live Segera!', { body: nearest.msg })
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [todaySlots])

  async function requestNotif() {
    if (typeof window !== 'undefined' && 'Notification' in window)
      setNotifPerm(await Notification.requestPermission())
  }

  const progress = Math.min((periodHours / targetHours) * 100, 100)
  const { totalLive, liveSucceed, totalGmv } = monthStats
  const successPct = totalLive > 0 ? Math.round((liveSucceed / totalLive) * 100) : 0
  const emptyChart = chartData.length === 0
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const gaugeData = [
    { name: 'Sukses', value: liveSucceed > 0 ? liveSucceed : 0.01 },
    { name: 'Belum', value: Math.max(totalLive - liveSucceed, 0) > 0 ? Math.max(totalLive - liveSucceed, 0) : (liveSucceed === 0 ? 0.99 : 0.001) },
  ]
  const missingReports = monthSlots.filter(s => !monthReportMap[s.id])

  return (
    <AppShell role="host" userName={profile.full_name}>
      <div className="p-4 max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Halo, {profile.full_name.split(' ')[0]} 👋</h1>
            <p className="text-xs text-gray-500 mt-0.5">{today}</p>
          </div>
          <button onClick={requestNotif}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-medium flex-shrink-0 transition-colors ${
              notifPerm === 'granted'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}>
            {notifPerm === 'granted' ? <Bell size={12} /> : <BellOff size={12} />}
            {notifPerm === 'granted' ? 'Alarm On' : 'Alarm'}
          </button>
        </div>

        {/* Alarm banner */}
        {alarmMsg && (
          <div className="bg-amber-500 text-white rounded-2xl px-4 py-3 flex items-center gap-3">
            <Bell size={18} className="flex-shrink-0 animate-bounce" />
            <div>
              <p className="font-bold text-sm">⏰ Jadwal Segera!</p>
              <p className="text-amber-100 text-xs">{alarmMsg}</p>
            </div>
          </div>
        )}

        {/* Month filter + stats */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500 font-medium">Bulan:</span>
            <select value={chartMonthIdx} onChange={e => setChartMonthIdx(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white">
              {monthOptions.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white rounded-2xl border border-gray-100 p-3.5">
              <p className="text-xs text-gray-500 mb-0.5">Total Live</p>
              <p className="text-2xl font-bold text-gray-900">{totalLive}</p>
              <p className="text-[10px] text-gray-400">sesi bulan ini</p>
            </div>
            <div className="bg-white rounded-2xl border border-emerald-100 p-3.5">
              <p className="text-xs text-emerald-600 mb-0.5">Live Sukses</p>
              <p className="text-2xl font-bold text-emerald-600">{liveSucceed}</p>
              <p className="text-[10px] text-emerald-400">{successPct}% laporan masuk</p>
            </div>
            <div className="bg-white rounded-2xl border border-brand-100 p-3.5">
              <p className="text-xs text-brand-600 mb-0.5">Target Jam</p>
              <p className="text-2xl font-bold text-brand-700">{periodHours.toFixed(1)}</p>
              <p className="text-[10px] text-brand-400">dari {targetHours} jam</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-3.5">
              <p className="text-xs text-gray-500 mb-0.5">Total GMV</p>
              <p className="text-xl font-bold text-gray-900 leading-tight">{fmtGMV(totalGmv)}</p>
              <p className="text-[10px] text-gray-400">bulan ini</p>
            </div>
          </div>
        </div>

        {/* GMV chart — PROMINENT (full width) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h2 className="font-bold text-gray-900 text-sm">GMV per Hari</h2>
          <p className="text-xs text-gray-400 mb-3">Pendapatan dari laporan live</p>
          {emptyChart ? (
            <div className="h-[110px] flex items-center justify-center text-sm text-gray-300">
              Belum ada laporan bulan ini
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false}/>
                <YAxis tickFormatter={(v: any) => fmtGMV(Number(v)).replace('Rp', '')}
                  tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={40}/>
                <Tooltip formatter={(v: any) => [`Rp${Number(v).toLocaleString('id-ID')}`, 'GMV']}
                  labelFormatter={(l: any) => fmtShortDate(String(l))}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}/>
                <Line type="monotone" dataKey="gmv" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}/>
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Gauge + Traffic */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="font-bold text-gray-900 text-sm">Tingkat Sukses</h2>
            <div className="relative">
              <ResponsiveContainer width="100%" height={110}>
                <PieChart>
                  <Pie data={gaugeData} cx="50%" cy="100%" startAngle={180} endAngle={0}
                    innerRadius="55%" outerRadius="85%" dataKey="value" strokeWidth={0}
                    paddingAngle={liveSucceed > 0 && liveSucceed < totalLive ? 4 : 0}>
                    <Cell fill="#7c3aed"/><Cell fill="#e5e7eb"/>
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-x-0 bottom-1 flex flex-col items-center pointer-events-none">
                <span className="text-2xl font-bold text-brand-700">{liveSucceed}/{totalLive}</span>
                <span className="text-[10px] text-gray-400">{successPct}% sukses</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="font-bold text-gray-900 text-sm">Traffic per Hari</h2>
            {emptyChart ? (
              <div className="h-[100px] flex items-center justify-center text-xs text-gray-300">Belum ada data</div>
            ) : (
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false}/>
                  <YAxis tickFormatter={(v: any) => fmtNum(Number(v))} tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={32}/>
                  <Tooltip labelFormatter={(l: any) => fmtShortDate(String(l))} contentStyle={{ fontSize: 11, borderRadius: 8 }}/>
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }}/>
                  <Line type="monotone" dataKey="impression" name="Impresi" stroke="#3b82f6" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="viewer" name="Penonton" stroke="#10b981" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="comment" name="Komentar" stroke="#f59e0b" strokeWidth={1.5} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Target progress bar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-brand-600"/>
              <span className="font-bold text-gray-900 text-sm">Target Jam Live</span>
            </div>
            <span className="text-sm font-bold text-brand-700">{periodHours.toFixed(1)} / {targetHours} jam</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand-500 to-brand-600 rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}/>
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{progress.toFixed(1)}% tercapai</span>
            <span>{Math.max(targetHours - periodHours, 0).toFixed(1)} jam lagi · {payPeriod.label}</span>
          </div>
        </div>

        {/* Jadwal hari ini */}
        {todaySlots.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-sm">Jadwal Hari Ini</h2>
              <Link href="/my-schedule" className="text-xs text-brand-600 font-medium">Semua →</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {todaySlots.map(slot => {
                const report = reportMap[slot.id]
                return (
                  <div key={slot.id} className="px-4 py-3 flex items-center gap-3">
                    <p className="font-mono text-[10px] font-bold text-gray-500 w-14 flex-shrink-0">{SESSION_LABELS[slot.session_no]}</p>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{slot.rooms?.name}</p>
                      {slot.brand && <p className="text-xs text-gray-400 truncate">{slot.brand}</p>}
                    </div>
                    {report ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">✓</span>
                    ) : (
                      <Link href={`/live-report?slot=${slot.id}`}
                        className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold hover:bg-amber-200 flex-shrink-0">
                        Report
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Report status table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900 text-sm">Status Laporan</h2>
              <p className="text-[10px] text-gray-400">Cek live yang belum dilaporan</p>
            </div>
            {missingReports.length > 0 && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">{missingReports.length} belum</span>
            )}
          </div>
          {monthSlots.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">Tidak ada jadwal bulan ini</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {monthSlots.map(slot => {
                const hasReport = !!monthReportMap[slot.id]
                const d = new Date(slot.slot_date + 'T00:00:00')
                return (
                  <div key={slot.id} className={`flex items-center gap-3 px-4 py-2.5 ${!hasReport ? 'bg-red-50/40' : ''}`}>
                    <span className="text-[10px] text-gray-400 w-14 flex-shrink-0 font-mono">
                      {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-xs text-gray-500 w-16 flex-shrink-0 font-mono">{SESSION_LABELS[slot.session_no]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{(slot.rooms as any)?.name}</p>
                      {slot.brand && <p className="text-[10px] text-gray-400 truncate">{slot.brand}</p>}
                    </div>
                    {hasReport ? (
                      <span className="text-[10px] text-emerald-600 font-semibold flex-shrink-0">✓ Terlapor</span>
                    ) : (
                      <Link href={`/live-report?slot=${slot.id}`}
                        className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold hover:bg-red-200 flex-shrink-0">
                        + Lapor
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </AppShell>
  )
}
