'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPayPeriod, toLocalDateStr, PLATFORM_COLORS } from '@/lib/utils'
import { CalendarDays, Clock, Users, Filter, Camera } from 'lucide-react'

const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

function slotTimeLabel(slot: { jam_mulai?: string; durasi?: number; session_no: number }): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  let startMin: number
  if (slot.jam_mulai) {
    const [h, m] = slot.jam_mulai.split(':').map(Number)
    startMin = h * 60 + (m || 0)
  } else {
    startMin = (slot.session_no - 1) * 60
  }
  const durMin = (slot.durasi && slot.durasi > 0 ? slot.durasi : 1) * 60
  const endMin = startMin + durMin
  const fmt = (mins: number) => `${pad(Math.floor((mins % 1440) / 60))}:${pad(mins % 60)}`
  return `${fmt(startMin)} – ${fmt(endMin)}`
}

interface Slot {
  id: string; slot_date: string; session_no: number; status: string
  brand?: string; platform?: string; konsep?: string
  background?: string; kostum?: string; gimmick?: string
  jam_mulai?: string; durasi?: number; host_id?: string
  look_approval_at?: string | null; look_approval_url?: string | null
  rooms: { name: string }
  profiles: { full_name: string; id: string } | null
}
interface Host { id: string; full_name: string }

function getPeriodOptions() {
  const opts = []
  for (let i = 0; i < 6; i++) {
    const d = new Date()
    if (i > 0) d.setMonth(d.getMonth() - i)
    const period = getPayPeriod(d)
    opts.push({ label: period.label, start: toLocalDateStr(period.start), end: toLocalDateStr(period.end) })
  }
  return opts
}

// Look Approval is "on time" when it happened at/before the session's own start.
function lookApprovalOnTime(slot: Slot): boolean {
  if (!slot.look_approval_at) return false
  const approvalTime = new Date(slot.look_approval_at)
  const sessionStart = slot.jam_mulai
    ? new Date(`${slot.slot_date}T${slot.jam_mulai}`)
    : new Date(`${slot.slot_date}T${String(slot.session_no - 1).padStart(2, '0')}:00:00`)
  return approvalTime <= sessionStart
}

function LookStatusCell({ slot }: { slot: Slot }) {
  if (!slot.look_approval_at) {
    return <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full whitespace-nowrap">— Belum</span>
  }
  const onTime = lookApprovalOnTime(slot)
  const timeFmt = new Date(slot.look_approval_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  const classes = onTime
    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
    : 'bg-red-100 text-red-700 hover:bg-red-200'
  const label = `${onTime ? '✅ Tepat Waktu' : '🔴 Terlambat'} · ${timeFmt}`

  if (!slot.look_approval_url) {
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${classes}`}>{label}</span>
  }
  return (
    <button onClick={e => { e.stopPropagation(); window.open(slot.look_approval_url!, '_blank') }}
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap transition-colors ${classes}`}>
      <Camera size={10}/> {label}
    </button>
  )
}

export default function RecapTab({ profile: _profile }: { profile: any }) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedHost, setSelectedHost] = useState('')
  const [periodIdx, setPeriodIdx] = useState(0)

  const periodOptions = getPeriodOptions()
  const selectedPeriod = periodOptions[periodIdx]

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    let slotsQuery = supabase.from('schedule_slots')
      .select('id, slot_date, session_no, status, brand, platform, konsep, background, kostum, gimmick, jam_mulai, durasi, host_id, look_approval_at, look_approval_url, rooms:room_id(name), profiles:host_id(full_name, id)')
      .gte('slot_date', selectedPeriod.start)
      .lte('slot_date', selectedPeriod.end)
      .not('host_id', 'is', null)
      .order('slot_date').order('session_no')

    if (selectedHost) slotsQuery = slotsQuery.eq('host_id', selectedHost)

    const [slotsRes, hostsRes, reportsRes] = await Promise.all([
      slotsQuery,
      supabase.from('profiles').select('id, full_name').eq('role', 'host').eq('is_active', true).order('full_name'),
      supabase.from('live_reports')
        .select('slot_id, id, gmv, screenshot_url')
        .gte('report_date', selectedPeriod.start)
        .lte('report_date', selectedPeriod.end),
    ])

    setSlots((slotsRes.data as unknown as Slot[]) || [])
    setHosts(hostsRes.data || [])
    setReports(reportsRes.data || [])
    setLoading(false)
  }, [selectedPeriod.start, selectedPeriod.end, selectedHost])

  useEffect(() => { fetchData() }, [fetchData])

  const reportBySlotId = Object.fromEntries((reports || []).map((r: any) => [r.slot_id, r]))

  // Group slots by date
  const byDate: Record<string, Slot[]> = {}
  slots.forEach(s => {
    if (!byDate[s.slot_date]) byDate[s.slot_date] = []
    byDate[s.slot_date].push(s)
  })

  const totalWithReport = slots.filter(s => reportBySlotId[s.id]).length

  return (
      <div className="w-full">

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-gray-400"/>
            <span className="text-xs text-gray-500 font-medium">Filter:</span>
          </div>
          <select value={periodIdx} onChange={e => setPeriodIdx(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
            {periodOptions.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
          </select>
          <select value={selectedHost} onChange={e => setSelectedHost(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white min-w-[160px]">
            <option value="">Semua Host</option>
            {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
          </select>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Sesi', value: slots.length, icon: CalendarDays, color: 'bg-brand-50 border-brand-100 text-brand-700' },
            { label: selectedHost ? '1 Host' : `${hosts.length} Host`, value: '', icon: Users, color: 'bg-blue-50 border-blue-100 text-blue-700' },
            { label: 'Laporan Masuk', value: `${totalWithReport}/${slots.length}`, icon: CalendarDays, color: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
            { label: 'Belum Laporan', value: `${slots.length - totalWithReport}`, icon: Clock, color: 'bg-orange-50 border-orange-100 text-orange-700' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`rounded-2xl border p-4 flex items-center gap-3 ${color}`}>
              <Icon size={18} className="flex-shrink-0 opacity-70"/>
              <div>
                <p className="text-xs opacity-70 font-medium">{label}</p>
                {value && <p className="text-lg font-bold leading-tight">{value}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Slots grouped by date, each day rendered as a wide table */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">Memuat...</div>
        ) : slots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
            Tidak ada data jadwal untuk periode dan filter ini
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(byDate)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, daySlots]) => {
                const d = new Date(date + 'T00:00:00')
                const isToday = date === toLocalDateStr(new Date())
                return (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className={`text-sm font-bold ${isToday ? 'text-brand-700' : 'text-gray-700'}`}>
                        {DAYS_ID[d.getDay()]}, {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {isToday && <span className="ml-2 text-[10px] bg-brand-600 text-white px-1.5 py-0.5 rounded-full">Hari Ini</span>}
                      </h3>
                      <span className="text-xs text-gray-300 bg-gray-100 px-1.5 py-0.5 rounded-full">{daySlots.length} sesi</span>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Jam</th>
                              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Host</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Brand</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Detail</th>
                              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Look Report</th>
                              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {daySlots.map(slot => {
                              const report = reportBySlotId[slot.id]
                              const details = [slot.rooms?.name, slot.konsep, slot.background, slot.kostum, slot.gimmick]
                                .filter(Boolean).join(' · ')
                              return (
                                <tr key={slot.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">{slotTimeLabel(slot)}</td>
                                  <td className="px-3 py-3 text-xs font-bold text-brand-700 whitespace-nowrap">{slot.profiles?.full_name || '?'}</td>
                                  <td className="px-3 py-3">
                                    {slot.brand && (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-bold text-gray-900 whitespace-nowrap">{slot.brand}</span>
                                        {slot.platform && (
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${PLATFORM_COLORS[slot.platform] || PLATFORM_COLORS.Other}`}>
                                            {slot.platform}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-xs text-gray-500 max-w-[260px] truncate">{details || '—'}</td>
                                  <td className="px-3 py-3"><LookStatusCell slot={slot}/></td>
                                  <td className="px-3 py-3">
                                    {report ? (
                                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                                        Laporan ✓
                                      </span>
                                    ) : (
                                      <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                                        No report
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>
  )
}
