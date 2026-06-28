'use client'
import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getPayPeriod, toLocalDateStr, SESSION_LABELS, PLATFORM_COLORS } from '@/lib/utils'
import { CalendarDays, Clock, Users, Filter } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'

const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

interface Slot {
  id: string; slot_date: string; session_no: number; status: string
  brand?: string; platform?: string; konsep?: string
  background?: string; kostum?: string; gimmick?: string
  jam_mulai?: string; durasi?: number; host_id?: string
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

export default function RecapClient({ profile }: { profile: any }) {
  const { lang } = useLang()
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
      .select('id, slot_date, session_no, status, brand, platform, konsep, background, kostum, gimmick, jam_mulai, durasi, host_id, rooms:room_id(name), profiles:host_id(full_name, id)')
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

  const totalHours = 0 // check_ins join removed — calculated separately if needed
  const totalWithReport = slots.filter(s => reportBySlotId[s.id]).length

  return (
    <AppShell role="superadmin" userName={profile.full_name}>
      <div className="p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{tr('recapschedule', lang)}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tr('recapDesc', lang)}</p>
        </div>

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

        {/* Slots grouped by date */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">Memuat...</div>
        ) : slots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
            Tidak ada data jadwal untuk periode dan filter ini
          </div>
        ) : (
          <div className="space-y-4">
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
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                      {daySlots.map(slot => {
                        const report = reportBySlotId[slot.id]
                        return (
                          <div key={slot.id} className="flex items-start gap-3 px-4 py-3">
                            {/* Time */}
                            <span className="font-mono text-xs text-gray-500 w-14 flex-shrink-0 pt-0.5">
                              {slot.jam_mulai ? slot.jam_mulai.slice(0,5) : SESSION_LABELS[slot.session_no]}
                            </span>
                            {/* Host name */}
                            {!selectedHost && (
                              <span className="text-sm font-bold text-brand-700 w-20 flex-shrink-0 truncate pt-0.5">
                                {slot.profiles?.full_name || '?'}
                              </span>
                            )}
                            {/* Brand · Platform · Room · Details */}
                            <div className="flex-1 min-w-0">
                              {slot.brand && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-bold text-gray-900">{slot.brand}</span>
                                  {slot.platform && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${PLATFORM_COLORS[slot.platform] || PLATFORM_COLORS.Other}`}>
                                      {slot.platform}
                                    </span>
                                  )}
                                </div>
                              )}
                              <p className="text-xs text-gray-500 mt-0.5">{slot.rooms?.name}</p>
                              {(slot.konsep || slot.background || slot.kostum || slot.gimmick) && (
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {[slot.konsep, slot.background, slot.kostum, slot.gimmick].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                            {/* Report badge */}
                            <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                              {report ? (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                                  Laporan ✓
                                </span>
                              ) : (
                                <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">
                                  No report
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
