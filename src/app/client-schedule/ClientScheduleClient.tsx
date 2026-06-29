'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { PLATFORM_COLORS, STATUS_COLORS, getWeekDates, toLocalDateStr } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'

const DAYS_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

interface Slot {
  id: string; slot_date: string; session_no: number; room_id: string
  brand?: string; platform?: string; konsep?: string; status: string; host_id?: string
}

// Merged representation of 1–N consecutive slots from the same session block
interface MergedSlot {
  id: string
  slot_date: string
  timeLabel: string     // e.g. "09:00 – 13:00"
  room_id: string
  brand?: string
  platform?: string
  konsep?: string
  status: string
  host_id?: string
}

// Collapse runs of consecutive session_no that share the same date/brand/room/platform/konsep.
// host_id and status are taken from the first slot in the run (they are almost always uniform).
function mergeConsecutiveSlots(slots: Slot[]): MergedSlot[] {
  if (!slots.length) return []

  const sorted = [...slots].sort((a, b) => {
    if (a.slot_date !== b.slot_date) return a.slot_date.localeCompare(b.slot_date)
    return a.session_no - b.session_no
  })

  const result: MergedSlot[] = []
  let i = 0

  while (i < sorted.length) {
    const first = sorted[i]
    let j = i + 1

    while (
      j < sorted.length &&
      sorted[j].slot_date    === first.slot_date &&
      sorted[j].brand        === first.brand &&
      sorted[j].room_id      === first.room_id &&
      sorted[j].platform     === first.platform &&
      sorted[j].konsep       === first.konsep &&
      sorted[j].session_no   === sorted[j - 1].session_no + 1
    ) {
      j++
    }

    const last = sorted[j - 1]
    const startHour = first.session_no - 1   // session_no=10 starts at 09:00
    const endHour   = last.session_no         // session_no=13 ends at 13:00

    result.push({
      id:        first.id,
      slot_date: first.slot_date,
      timeLabel: `${String(startHour).padStart(2, '0')}:00 – ${String(endHour).padStart(2, '0')}:00`,
      room_id:   first.room_id,
      brand:     first.brand,
      platform:  first.platform,
      konsep:    first.konsep,
      status:    first.status,
      host_id:   first.host_id,
    })

    i = j
  }

  return result
}

export default function ClientScheduleClient({ profile }: { profile: any }) {
  const { lang } = useLang()
  const [baseDate, setBaseDate] = useState(new Date())
  const [weekDates, setWeekDates] = useState<Date[]>(getWeekDates(new Date()))
  const [slots, setSlots] = useState<Slot[]>([])
  const [rooms, setRooms] = useState<Record<string, { name: string }>>({})
  const [hosts, setHosts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setWeekDates(getWeekDates(baseDate))
  }, [baseDate])

  // Rooms (RLS: using true — always available).
  // Host names require migration 12 to allow clients to read host profiles.
  // Until then the fetch returns 0 rows and host names show as "—".
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('rooms').select('id, name'),
      supabase.from('profiles').select('id, full_name').eq('role', 'host').eq('is_active', true),
    ]).then(([{ data: roomData }, { data: hostData }]) => {
      const roomMap: Record<string, { name: string }> = {}
      ;(roomData || []).forEach((r: any) => { roomMap[r.id] = { name: r.name } })
      setRooms(roomMap)
      const hostMap: Record<string, string> = {}
      ;(hostData || []).forEach((h: any) => { hostMap[h.id] = h.full_name })
      setHosts(hostMap)
    })
  }, [])

  useEffect(() => {
    if (!weekDates.length) return
    setLoading(true)
    const supabase = createClient()
    const from = toLocalDateStr(weekDates[0])
    const to   = toLocalDateStr(weekDates[6])

    // Do NOT embed profiles(full_name) — clients can only read their own profile row via RLS.
    // Host names are resolved from a separately fetched hosts map (requires migration 12).
    let q = supabase
      .from('schedule_slots')
      .select('id, slot_date, session_no, room_id, brand, platform, konsep, status, host_id')
      .gte('slot_date', from).lte('slot_date', to)
      .order('slot_date').order('session_no')

    if (profile.role === 'client' && profile.client_brand) {
      q = q.eq('brand', profile.client_brand)
    } else {
      q = q.not('host_id', 'is', null)
    }

    q.then(({ data }) => {
      setSlots(data || [])
      setLoading(false)
    })
  }, [weekDates, profile])

  const merged = mergeConsecutiveSlots(slots)

  const grouped = weekDates.map((date, i) => {
    const dateStr  = toLocalDateStr(date)
    const daySlots = merged.filter(s => s.slot_date === dateStr)
    return { date, dayLabel: DAYS_ID[i], dateStr, daySlots }
  }).filter(d => d.daySlots.length > 0)

  const weekLabel = weekDates.length
    ? `${toLocalDateStr(weekDates[0])} – ${toLocalDateStr(weekDates[6])}`
    : ''

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header + week nav */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tr('clientschedule', lang)}</h1>
            {profile.client_brand && (
              <p className="text-sm text-gray-500 mt-0.5">
                Brand: <span className="font-semibold text-brand-700">{profile.client_brand}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-2 py-1.5">
            <button
              onClick={() => { const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d) }}
              className="p-1 rounded-lg hover:bg-gray-100">
              <ChevronLeft size={15}/>
            </button>
            <span className="text-xs font-semibold text-gray-700 px-2">{weekLabel}</span>
            <button
              onClick={() => { const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d) }}
              className="p-1 rounded-lg hover:bg-gray-100">
              <ChevronRight size={15}/>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
            Memuat...
          </div>
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <p className="text-gray-400 text-sm">
              {lang === 'id' ? 'Tidak ada jadwal live minggu ini' : 'No live schedule this week'}
            </p>
          </div>
        ) : grouped.map(({ date, dayLabel, daySlots }) => (
          <div key={dayLabel} className="mb-5">
            <h2 className="text-sm font-bold text-gray-700 mb-2">
              {dayLabel}, {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {daySlots.map(slot => (
                <div key={slot.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="font-mono text-xs text-gray-500 w-28 flex-shrink-0">
                    {slot.timeLabel}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {slot.host_id
                        ? (hosts[slot.host_id] || '—')
                        : (rooms[slot.room_id]?.name || '—')}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {rooms[slot.room_id]?.name || '—'}{slot.konsep ? ` · ${slot.konsep}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {slot.platform && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[slot.platform] || PLATFORM_COLORS.Other}`}>
                        {slot.platform}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[slot.status]}`}>
                      {tr(slot.status, lang)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  )
}
