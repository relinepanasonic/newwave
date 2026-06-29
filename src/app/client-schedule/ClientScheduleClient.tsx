'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { SESSION_LABELS, PLATFORM_COLORS, STATUS_COLORS, getWeekDates, toLocalDateStr } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'

const DAYS_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

interface Slot {
  id: string; slot_date: string; session_no: number; room_id: string
  brand?: string; platform?: string; konsep?: string; status: string
  rooms?: { name: string; group_name: string }
}

export default function ClientScheduleClient({ profile }: { profile: any }) {
  const { lang } = useLang()
  const [baseDate, setBaseDate] = useState(new Date())
  const [weekDates, setWeekDates] = useState<Date[]>(getWeekDates(new Date()))
  const [slots, setSlots] = useState<Slot[]>([])
  const [rooms, setRooms] = useState<Record<string, { name: string; group_name: string }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setWeekDates(getWeekDates(baseDate))
  }, [baseDate])

  // Load the room lookup once (rooms RLS allows all authenticated users)
  useEffect(() => {
    createClient().from('rooms').select('id, name, group_name').then(({ data }) => {
      const map: Record<string, { name: string; group_name: string }> = {}
      ;(data || []).forEach((r: any) => { map[r.id] = { name: r.name, group_name: r.group_name } })
      setRooms(map)
    })
  }, [])

  useEffect(() => {
    if (!weekDates.length) return
    setLoading(true)
    const supabase = createClient()
    const from = toLocalDateStr(weekDates[0])
    const to = toLocalDateStr(weekDates[6])

    // IMPORTANT: do NOT embed profiles(full_name) here. The profiles RLS only
    // lets a client read their own row, so embedding the host profile breaks
    // the whole query for clients (returns 0). Fetch slots plain — same shape
    // the client dashboard uses successfully — and resolve room names locally.
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

  // Group by date using toLocalDateStr to avoid UTC offset issues
  const grouped = weekDates.map((date, i) => {
    const dateStr = toLocalDateStr(date)
    const daySlots = slots.filter(s => s.slot_date === dateStr)
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
                  <span className="font-mono text-xs text-gray-500 w-16 flex-shrink-0">
                    {SESSION_LABELS[slot.session_no]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {rooms[slot.room_id]?.name || slot.brand || 'Live'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {slot.brand || '—'}{slot.konsep ? ` · ${slot.konsep}` : ''}
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
